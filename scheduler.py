import requests
from pymongo import MongoClient
from datetime import datetime, timedelta
from apscheduler.schedulers.blocking import BlockingScheduler
import logging
import os
from dotenv import load_dotenv
from langdetect import detect, LangDetectException

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CORE_API_KEY = os.getenv('CORE_API_KEY')
CORE_API_URL = "https://api.core.ac.uk/v3/search/works"
MONGODB_ATLAS_URI = os.getenv('MONGODB_ATLAS_URI')
MIN_PAGE_COUNT = 15

# MongoDB Atlas setup
try:
    client = MongoClient(MONGODB_ATLAS_URI)
    client.admin.command('ping')
    print("✓ Connected to MongoDB Atlas successfully!")
except Exception as e:
    print(f"✗ Failed to connect to MongoDB Atlas: {e}")
    exit(1)

db = client['research_papers']
papers_collection = db['papers']

def is_english_text(text, threshold=0.7):
    """
    Check if text is in English using language detection
    threshold: confidence level (0.7 = 70% confidence)
    """
    if not text or len(text.strip()) < 50:
        return False
    
    try:
        # Use only abstract for language detection
        detected_lang = detect(text[:500])  # Use first 500 chars
        return detected_lang == 'en'
    except LangDetectException:
        return False

def get_page_count(paper_data):
    """
    Extract page count from paper metadata
    """
    try:
        # CORE API may provide page count info
        if 'pageCount' in paper_data:
            return int(paper_data['pageCount'])
        
        # Alternative: check source metadata
        if 'pages' in paper_data:
            page_str = str(paper_data['pages'])
            # Extract numbers if format is "10-25"
            if '-' in page_str:
                parts = page_str.split('-')
                if len(parts) == 2:
                    try:
                        return int(parts[1]) - int(parts[0])
                    except ValueError:
                        return 0
            else:
                try:
                    return int(page_str)
                except ValueError:
                    return 0
        
        return 0
    except Exception as e:
        logger.warning(f"Error extracting page count: {str(e)}")
        return 0

def fetch_recent_papers():
    """Fetch recent English papers with minimum page count from CORE API"""
    try:
        # Calculate date range (last 7 days for better results)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        # CORE API v3 query for recent papers with abstracts
        query = f"yearPublished>={start_date.year} AND _exists_:abstract"
        
        headers = {
            'Authorization': f'Bearer {CORE_API_KEY}'
        }
        
        params = {
            'q': query,
            'limit': 100,  # Fetch more to filter by language and page count
            'offset': 0
        }
        
        logger.info(f"Fetching papers from CORE API...")
        response = requests.get(CORE_API_URL, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            papers = data.get('results', [])
            
            logger.info(f"Fetched {len(papers)} papers from CORE API")
            
            # Process and store papers in MongoDB Atlas
            inserted_count = 0
            filtered_count = 0
            
            for paper in papers:
                try:
                    # Extract data
                    title = paper.get('title', 'Untitled')
                    abstract = paper.get('abstract', '')
                    
                    # Skip if no abstract
                    if not abstract:
                        logger.debug(f"Skipping paper '{title}' - no abstract")
                        continue
                    
                    # Check if English
                    if not is_english_text(abstract):
                        filtered_count += 1
                        logger.debug(f"Skipping non-English paper: {title}")
                        continue
                    
                    # Check page count
                    page_count = get_page_count(paper)
                    if page_count < MIN_PAGE_COUNT and page_count > 0:
                        filtered_count += 1
                        logger.debug(f"Skipping paper '{title}' - only {page_count} pages (min: {MIN_PAGE_COUNT})")
                        continue
                    
                    # Build paper document
                    paper_doc = {
                        'coreId': paper.get('id'),
                        'title': title,
                        'abstract': abstract[:500],  # First 500 chars
                        'authors': [author.get('name', '') for author in paper.get('authors', []) if author.get('name')],
                        'publishedDate': paper.get('publishedDate', str(datetime.now())),
                        'downloadUrl': paper.get('downloadUrl', ''),
                        'sourceFulltextUrls': paper.get('sourceFulltextUrls', []),
                        'doi': paper.get('doi', ''),
                        'pageCount': page_count if page_count > 0 else None,
                        'language': 'English',
                        'fetchedAt': datetime.now()
                    }
                    
                    # Update or insert paper
                    result = papers_collection.update_one(
                        {'coreId': paper_doc['coreId']},
                        {'$set': paper_doc},
                        upsert=True
                    )
                    
                    if result.upserted_id or result.modified_count > 0:
                        inserted_count += 1
                        logger.info(f"✓ Stored: {title[:60]}... ({page_count} pages)")
                        
                except Exception as e:
                    logger.warning(f"Error processing paper {paper.get('id')}: {str(e)}")
                    continue
            
            logger.info(f"Successfully stored {inserted_count} English papers (filtered out {filtered_count})")
            return inserted_count
        else:
            logger.error(f"CORE API Error: {response.status_code} - {response.text}")
            return 0
            
    except Exception as e:
        logger.error(f"Error fetching papers: {str(e)}")
        return 0

def cleanup_old_papers():
    """Remove papers older than 30 days"""
    try:
        cutoff_date = datetime.now() - timedelta(days=30)
        result = papers_collection.delete_many({
            'fetchedAt': {'$lt': cutoff_date}
        })
        logger.info(f"Cleaned up {result.deleted_count} old papers from MongoDB Atlas")
    except Exception as e:
        logger.error(f"Error cleaning up papers: {str(e)}")

def daily_update_job():
    """Main job that runs daily"""
    logger.info("=" * 70)
    logger.info("Starting daily English paper update from CORE API...")
    logger.info(f"Minimum page requirement: {MIN_PAGE_COUNT} pages")
    logger.info("=" * 70)
    papers_count = fetch_recent_papers()
    cleanup_old_papers()
    logger.info(f"Daily update completed. Fetched {papers_count} valid English papers.")
    logger.info("=" * 70)

if __name__ == '__main__':
    # Run immediately on start
    logger.info("Running initial fetch...")
    daily_update_job()
    
    # Schedule daily updates at midnight IST
    scheduler = BlockingScheduler()
    # For IST (UTC+5:30), adjust accordingly. Using 18:30 UTC = 00:00 IST
    scheduler.add_job(daily_update_job, 'cron', hour=18, minute=30, timezone='UTC')
    
    logger.info("Scheduler started. Will run daily at midnight IST (18:30 UTC).")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
