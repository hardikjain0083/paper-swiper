import requests
from pymongo import MongoClient
from datetime import datetime, timedelta
from apscheduler.schedulers.blocking import BlockingScheduler
import logging
import os
from dotenv import load_dotenv
from langdetect import detect, LangDetectException
import xml.etree.ElementTree as ET
import urllib.parse
import time

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CORE_API_KEY = os.getenv('CORE_API_KEY')
CORE_API_URL = "https://api.core.ac.uk/v3/search/works"
ARXIV_API_URL = "http://export.arxiv.org/api/query"
MONGODB_ATLAS_URI = os.getenv('MONGODB_ATLAS_URI')
MIN_PAGE_COUNT = 5 # Reduced min page count for arXiv papers as they might be shorter

# Domain mapping to arXiv categories
DOMAIN_ARXIV_MAPPING = {
    'artificial_intelligence': 'cat:cs.AI',
    'computer_vision': 'cat:cs.CV',
    'data_science': 'cat:cs.DS', # Data Structures and Algorithms as proxy, or cs.LG for learning
    'cloud_computing': 'cat:cs.DC', # Distributed, Parallel, and Cluster Computing
    'cybersecurity': 'cat:cs.CR', # Cryptography and Security
    'software_engineering': 'cat:cs.SE',
    'high_performance_computing': 'cat:cs.PF' # Performance
}

# Add more specific mappings or combined categories if needed
# For Data Science, often cs.LG (Machine Learning) or cs.DB (Databases) are also relevant.
# We will stick to primary categories for now.

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

def fetch_arxiv_papers(domain_key, arxiv_category):
    """Fetch recent papers from arXiv for a specific domain"""
    try:
        logger.info(f"Fetching arXiv papers for {domain_key} ({arxiv_category})...")
        
        # Construct query
        # sortBy=submittedDate&sortOrder=descending ensures we get the latest
        params = {
            'search_query': arxiv_category,
            'start': 0,
            'max_results': 10, # Fetch top 10 to ensure we get at least one good one
            'sortBy': 'submittedDate',
            'sortOrder': 'descending'
        }
        
        response = requests.get(ARXIV_API_URL, params=params, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"arXiv API Error: {response.status_code}")
            return 0

        # Parse XML response
        root = ET.fromstring(response.content)
        ns = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}
        
        inserted_count = 0
        
        for entry in root.findall('atom:entry', ns):
            try:
                # Extract data
                id_url = entry.find('atom:id', ns).text
                arxiv_id = id_url.split('/abs/')[-1]
                title = entry.find('atom:title', ns).text.strip().replace('\n', ' ')
                summary = entry.find('atom:summary', ns).text.strip().replace('\n', ' ')
                published = entry.find('atom:published', ns).text
                updated = entry.find('atom:updated', ns).text
                
                authors = []
                for author in entry.findall('atom:author', ns):
                    name = author.find('atom:name', ns).text
                    authors.append(name)
                
                links = entry.findall('atom:link', ns)
                pdf_url = ''
                for link in links:
                    if link.get('title') == 'pdf':
                        pdf_url = link.get('href')
                
                # Basic validation
                if not summary or not is_english_text(summary):
                    continue

                # Create paper object compatible with existing schema
                paper_doc = {
                    'coreId': f"arxiv:{arxiv_id}", # Use arXiv ID as unique identifier
                    'title': title,
                    'abstract': summary[:2000], # Allow longer abstracts
                    'authors': authors,
                    'publishedDate': published,
                    'downloadUrl': pdf_url,
                    'sourceFulltextUrls': [id_url],
                    'doi': '', # arXiv papers might not have DOI immediately
                    'pageCount': None, # arXiv API doesn't provide page count easily
                    'language': 'English',
                    'domains': [domain_key], # Tag with our domain key
                    'fetchedAt': datetime.now(),
                    'fetchedDate': datetime.now().date().isoformat(),
                    'source': 'arxiv'
                }
                
                # Update or insert paper
                # We use upsert=True to avoid duplicates but update if details changed
                result = papers_collection.update_one(
                    {'coreId': paper_doc['coreId']},
                    {'$set': paper_doc},
                    upsert=True
                )
                
                if result.upserted_id or result.modified_count > 0:
                    inserted_count += 1
                    logger.info(f"✓ Stored (arXiv): {title[:60]}...")
            
            except Exception as e:
                logger.warning(f"Error processing arXiv entry: {str(e)}")
                continue
                
        return inserted_count

    except Exception as e:
        logger.error(f"Error fetching from arXiv for {domain_key}: {str(e)}")
        return 0

def fetch_recent_papers_core():
    """Fetch recent English papers with minimum page count from CORE API (Legacy/Backup)"""
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
            'limit': 50,
            'offset': 0
        }
        
        if not CORE_API_KEY:
            logger.warning("CORE_API_KEY not set, skipping CORE fetch.")
            return 0

        logger.info(f"Fetching papers from CORE API...")
        response = requests.get(CORE_API_URL, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            papers = data.get('results', [])
            
            inserted_count = 0
            
            for paper in papers:
                try:
                    # Extract data
                    title = paper.get('title', 'Untitled')
                    abstract = paper.get('abstract', '')
                    
                    if not abstract or not is_english_text(abstract):
                        continue
                    
                    page_count = get_page_count(paper)
                    if page_count < MIN_PAGE_COUNT and page_count > 0:
                        continue
                    
                    # We need to guess domains for CORE papers or they won't show up in specific categories
                    # For now, we can leave them as generic or try to categorize them
                    # But the user specifically asked for "at least one paper in every domain"
                    # which arXiv handles better.
                    
                    paper_doc = {
                        'coreId': str(paper.get('id')),
                        'title': title,
                        'abstract': abstract[:2000],
                        'authors': [author.get('name', '') for author in paper.get('authors', []) if author.get('name')],
                        'publishedDate': paper.get('publishedDate', str(datetime.now())),
                        'downloadUrl': paper.get('downloadUrl', ''),
                        'sourceFulltextUrls': paper.get('sourceFulltextUrls', []),
                        'doi': paper.get('doi', ''),
                        'pageCount': page_count if page_count > 0 else None,
                        'language': 'English',
                        'fetchedAt': datetime.now(),
                        'fetchedDate': datetime.now().date().isoformat(),
                        'source': 'core'
                    }
                    
                    result = papers_collection.update_one(
                        {'coreId': paper_doc['coreId']},
                        {'$set': paper_doc},
                        upsert=True
                    )
                    
                    if result.upserted_id or result.modified_count > 0:
                        inserted_count += 1
                        
                except Exception as e:
                    continue
            
            logger.info(f"Stored {inserted_count} papers from CORE API")
            return inserted_count
        else:
            logger.error(f"CORE API Error: {response.status_code}")
            return 0
            
    except Exception as e:
        logger.error(f"Error fetching papers from CORE: {str(e)}")
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
        # Be careful not to delete everything if dates are parsed differently
        # Using fetchedAt which is a datetime object
        result = papers_collection.delete_many({
            'fetchedAt': {'$lt': cutoff_date}
        })
        logger.info(f"Cleaned up {result.deleted_count} old papers from MongoDB Atlas")
    except Exception as e:
        logger.error(f"Error cleaning up papers: {str(e)}")

def daily_update_job():
    """Main job that runs daily"""
    logger.info("=" * 70)
    logger.info("Starting daily paper update...")
    logger.info("=" * 70)
    
    total_new_papers = 0
    
    # 1. Fetch from arXiv for EACH domain to ensure coverage
    for domain, category in DOMAIN_ARXIV_MAPPING.items():
        count = fetch_arxiv_papers(domain, category)
        total_new_papers += count
        # Be nice to the API
        time.sleep(1) 
        
    # 2. Optionally fetch from CORE as supplement
    core_count = fetch_recent_papers_core()
    total_new_papers += core_count
    
    # 3. Cleanup
    cleanup_old_papers()
    
    # 4. Update stats
    try:
        domain_stats = {d: 0 for d in DOMAIN_ARXIV_MAPPING.keys()}
        # Calculate stats for today
        today_str = datetime.now().date().isoformat()
        for domain in domain_stats.keys():
            c = papers_collection.count_documents({
                'fetchedDate': today_str,
                'domains': domain
            })
            domain_stats[domain] = c
            
        update_stats = {
            'timestamp': datetime.now(),
            'total_papers': total_new_papers,
            'domain_stats': domain_stats
        }
        db['update_stats'].insert_one(update_stats)
    except Exception as e:
        logger.error(f"Error updating stats: {e}")

    logger.info(f"Daily update completed. Total new papers: {total_new_papers}")
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
