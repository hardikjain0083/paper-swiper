import requests
from pymongo import MongoClient
from datetime import datetime, timedelta
from apscheduler.schedulers.blocking import BlockingScheduler
import logging
import os
from dotenv import load_dotenv
from langdetect import detect, LangDetectException
from pymongo.errors import DuplicateKeyError

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

# Domain keywords (used for selecting old papers to promote when no new papers found)
DOMAIN_KEYWORDS = {
    'artificial_intelligence': [
        "artificial intelligence", "machine learning", "deep learning", "neural network",
        "natural language processing", "nlp", "llm", "large language model",
        "transformer", "bert", "gpt", "chatbot"
    ],
    'computer_vision': [
        "computer vision", "object detection", "semantic segmentation",
        "image processing", "computer graphics", "augmented reality",
        "virtual reality", "ar vr"
    ],
    'data_science': [
        "data science", "big data", "data mining", "data analytics",
        "recommendation system", "knowledge graph", "data visualization"
    ],
}

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
        
        # We'll page through the first few pages to catch recent additions.
        inserted_count = 0
        filtered_count = 0
        max_pages = 3
        per_page = 100

        logger.info("Fetching papers from CORE API (paging)...")
        for page in range(max_pages):
            params = {
                'q': query,
                'limit': per_page,
                'offset': page * per_page
            }

            response = requests.get(CORE_API_URL, headers=headers, params=params, timeout=30)
            if response.status_code != 200:
                logger.error(f"CORE API Error on page {page}: {response.status_code} - {response.text}")
                continue

            data = response.json()
            papers = data.get('results', [])
            logger.info(f"Fetched {len(papers)} papers from CORE API (page {page})")

            # Process and store papers in MongoDB Atlas
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
                        'fetchedAt': datetime.now(),
                        # keep a stable fetchedDate string for easier querying
                        'fetchedDate': datetime.now().date().isoformat()
                    }
                    
                    # Update or insert paper
                    result = papers_collection.update_one(
                        {'coreId': paper_doc['coreId']},
                        {'$set': paper_doc},
                        upsert=True
                    )
                    
                    if result.upserted_id or result.modified_count > 0:
                        inserted_count += 1
                        logger.info(f"✓ Stored/Updated: {title[:60]}... ({page_count} pages)")
                        
                except Exception as e:
                    logger.warning(f"Error processing paper {paper.get('id')}: {str(e)}")
                    continue
            logger.info(f"Successfully stored/updated {inserted_count} English papers (filtered out {filtered_count})")
            return inserted_count
    except Exception as e:
        logger.error(f"Error fetching papers: {str(e)}")
        return 0


def promote_old_papers(limit_per_domain=10):
    """When no new papers are found, promote older domain-similar papers by inserting
    copies with today's fetchedDate so they appear in today's listing. If an insert
    fails due to a duplicate key, add today to the document's `promotedDates` array.
    """
    today_str = datetime.now().date().isoformat()
    total_promoted = 0

    for domain in DOMAIN_KEYWORDS.keys():
        try:
            # Find older papers for this domain (not already marked for today)
            cursor = papers_collection.find({
                'domains': domain,
                'fetchedDate': {'$ne': today_str}
            }).sort('fetchedAt', 1).limit(limit_per_domain)

            for doc in cursor:
                promoted = dict(doc)
                promoted.pop('_id', None)
                original_date = promoted.get('fetchedDate')
                promoted['fetchedDate'] = today_str
                promoted['fetchedAt'] = datetime.now()
                promoted['promotedFrom'] = original_date

                try:
                    papers_collection.insert_one(promoted)
                    total_promoted += 1
                except DuplicateKeyError:
                    # If a unique index prevents inserting a duplicate coreId, record promotion
                    papers_collection.update_one(
                        {'coreId': promoted.get('coreId')},
                        {'$addToSet': {'promotedDates': today_str}}
                    )
        except Exception as e:
            logger.warning(f"Error promoting papers for domain {domain}: {e}")

    logger.info(f"Promoted {total_promoted} papers across domains")
    return total_promoted

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
    logger.info("Starting scheduled English paper update from CORE API...")
    logger.info(f"Minimum page requirement: {MIN_PAGE_COUNT} pages")
    logger.info("=" * 70)
    papers_count = fetch_recent_papers()
    # NOTE: per configuration, do not delete stored papers after reading.
    logger.info(f"Update completed. Fetched/updated {papers_count} valid English papers.")

    # If no new papers were added during this fetch, promote some older domain-similar papers
    # by creating promoted copies with today's fetchedDate so they appear in today's listing.
    if papers_count == 0:
        try:
            promote_old_papers()
        except Exception as e:
            logger.error(f"Error during promoting old papers: {e}")
    logger.info("=" * 70)

if __name__ == '__main__':
    # Run immediately on start
    logger.info("Running initial fetch...")
    daily_update_job()
    
    # Schedule daily updates at midnight IST
    scheduler = BlockingScheduler()
    # Schedule to run once every 24 hours
    scheduler.add_job(daily_update_job, 'interval', hours=24)

    logger.info("Scheduler started. Will run every 24 hours.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
