from flask import Flask, render_template, jsonify
from pymongo import MongoClient
from datetime import date, datetime, timedelta
import requests
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import os
from dotenv import load_dotenv
from langdetect import detect, LangDetectException
import logging

load_dotenv()

app = Flask(__name__)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MONGODB_ATLAS_URI = os.getenv('MONGODB_ATLAS_URI')
CORE_API_KEY = os.getenv('CORE_API_KEY')
CORE_API_URL = "https://api.core.ac.uk/v3/search/works"

# Domain-specific keywords
DOMAIN_KEYWORDS = {
    'artificial_intelligence': [
        "artificial intelligence", "machine learning", "deep learning", "neural network",
        "natural language processing", "NLP", "LLM", "large language model",
        "transformer", "BERT", "GPT", "chatbot"
    ],
    'computer_vision': [
        "computer vision", "object detection", "semantic segmentation",
        "image processing", "computer graphics", "augmented reality",
        "virtual reality", "AR VR"
    ],
    'data_science': [
        "data science", "big data", "data mining", "data analytics",
        "recommendation system", "knowledge graph", "data visualization",
        "statistical analysis"
    ],
    'cloud_computing': [
        "cloud computing", "edge computing", "distributed systems",
        "microservices", "DevOps", "API", "containerization",
        "serverless"
    ],
    'cybersecurity': [
        "cybersecurity", "network security", "information security",
        "cryptography", "blockchain", "cryptocurrency", "security protocols",
        "penetration testing"
    ],
    'software_engineering': [
        "software engineering", "web development", "algorithm",
        "software architecture", "design patterns", "API design",
        "testing", "continuous integration"
    ],
    'high_performance_computing': [
        "parallel computing", "GPU computing", "quantum computing",
        "high performance computing", "distributed computing",
        "supercomputing", "CUDA", "optimization"
    ]
}

# MongoDB connection
try:
    client = MongoClient(MONGODB_ATLAS_URI)
    client.admin.command('ping')
    print("✓ Connected to MongoDB Atlas successfully!")
except Exception as e:
    print(f"✗ Failed to connect to MongoDB Atlas: {e}")
    exit(1)

db = client['research_papers']
papers_collection = db['papers']

def is_english_text(text):
    """Check if text is in English"""
    if not text or len(text.strip()) < 50:
        return False
    try:
        lang = detect(text)
        return lang == 'en'
    except LangDetectException:
        return False
    except Exception:
        return False

def get_page_count(paper_data):
    """Extract page count from paper metadata"""
    try:
        if 'pageCount' in paper_data:
            return int(paper_data['pageCount'])
        
        if 'pages' in paper_data:
            page_str = str(paper_data['pages'])
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
        return 0

def get_paper_domains(paper):
    """Identify domains that a paper belongs to"""
    title = paper.get('title', '').lower()
    abstract = paper.get('abstract', '').lower()
    keywords = paper.get('keywords', [])
    
    searchable_text = f"{title} {abstract} {' '.join(keywords)}".lower()
    domains = []
    
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in searchable_text:
                domains.append(domain)
                break
    
    return domains

def is_ai_cs_paper(paper):
    """Check if paper is about AI or Computer Science"""
    return len(get_paper_domains(paper)) > 0

def fetch_and_store_papers():
    """Fetch recent AI and CS papers and store in MongoDB"""
    try:
        logger.info("=" * 70)
        logger.info("Starting paper fetch from CORE API...")
        logger.info("=" * 70)
        
        # Initialize domain stats for this update
        domain_stats = {domain: 0 for domain in DOMAIN_KEYWORDS.keys()}
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        
        query = f"yearPublished>={start_date.year} AND _exists_:abstract"
        
        headers = {
            'Authorization': f'Bearer {CORE_API_KEY}'
        }
        
        params = {
            'q': query,
            'limit': 150,
            'offset': 0
        }
        
        response = requests.get(CORE_API_URL, headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            all_papers = data.get('results', [])
            
            inserted_count = 0
            today = datetime.now().date()
            # store fetchedDate as an ISO string to avoid encoding datetime.date issues with PyMongo
            today_str = today.isoformat()
            
            for paper in all_papers:
                try:
                    title = paper.get('title', 'Untitled')
                    abstract = paper.get('abstract', '')
                    
                    if not abstract:
                        continue
                    
                    if not is_english_text(abstract):
                        continue
                    
                    if not is_ai_cs_paper(paper):
                        continue
                    
                    page_count = get_page_count(paper)
                    if page_count > 0 and page_count < 15:
                        continue
                    
                    paper_obj = {
                        'coreId': paper.get('id'),
                        'title': title,
                        'abstract': abstract[:500],
                        'authors': [author.get('name', '') for author in paper.get('authors', []) if author.get('name')],
                        'publishedDate': paper.get('publishedDate', str(datetime.now())),
                        'downloadUrl': paper.get('downloadUrl', ''),
                        'sourceFulltextUrls': paper.get('sourceFulltextUrls', []),
                        'doi': paper.get('doi', ''),
                        'pageCount': page_count if page_count > 0 else None,
                        'keywords': paper.get('keywords', [])[:5],
                        'domains': get_paper_domains(paper),
                        # store as string like 'YYYY-MM-DD' so queries and storage are consistent
                        'fetchedDate': today_str,
                        'fetchedAt': datetime.now()
                    }
                    
                    # Insert or update paper
                    result = papers_collection.update_one(
                        {'coreId': paper_obj['coreId']},
                        {'$set': paper_obj},
                        upsert=True
                    )
                    
                    if result.upserted_id or result.modified_count > 0:
                        inserted_count += 1
                        # Update domain stats
                        for domain in paper_obj['domains']:
                            domain_stats[domain] += 1
                        logger.info(f"✓ Stored: {title[:60]}... ({page_count} pages)")
                        
                        if inserted_count >= 50:  # Limit to 50 papers per update
                            break
                    
                except Exception as e:
                    logger.warning(f"Error processing paper: {str(e)}")
                    continue
            
            # Store update statistics
            update_stats = {
                'timestamp': datetime.now(),
                'total_papers': inserted_count,
                'domain_stats': domain_stats
            }
            db['update_stats'].insert_one(update_stats)
            
            logger.info(f"✓ Successfully stored {inserted_count} papers")
            for domain, count in domain_stats.items():
                if count > 0:
                    logger.info(f"  - {domain}: {count} papers")
            logger.info("=" * 70)
            
        else:
            logger.error(f"CORE API Error: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error in fetch_and_store_papers: {str(e)}")

def serialize_dates(paper):
    # Convert datetime.date or datetime.datetime to ISO string
    for key in ['fetchedDate', 'publishedDate', 'fetchedAt']:
        if key in paper and isinstance(paper[key], (datetime, date)):
            paper[key] = paper[key].isoformat()
    return paper

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/papers', methods=['GET'])
def get_papers():
    """Fetch today's papers from MongoDB"""
    try:
        today = datetime.now().date()
        today_str = today.isoformat()

        # Include papers fetched today or promoted for today
        papers = list(papers_collection.find(
            {'$or': [{'fetchedDate': today_str}, {'promotedDates': today_str}]},
            {'_id': 0}
        ).sort('publishedDate', -1).limit(100))

        papers = [serialize_dates(p) for p in papers]

        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers),
            'fetchDate': today_str
        })
    except Exception as e:
        logger.error(f"Error in get_papers: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/domains', methods=['GET'])
def get_domains():
    """Get list of available domains"""
    try:
        domains = sorted(DOMAIN_KEYWORDS.keys())
        domain_names = {
            'artificial_intelligence': 'Artificial Intelligence',
            'computer_vision': 'Computer Vision',
            'data_science': 'Data Science',
            'cloud_computing': 'Cloud Computing',
            'cybersecurity': 'Cybersecurity',
            'software_engineering': 'Software Engineering',
            'high_performance_computing': 'High Performance Computing'
        }
        
        return jsonify({
            'success': True,
            'domains': [{'id': d, 'name': domain_names.get(d, d)} for d in domains]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/papers/<domain>', methods=['GET'])
def get_papers_by_domain(domain):
    """Fetch today's papers for a specific domain"""
    try:
        today = datetime.now().date()
        today_str = today.isoformat()
        
        if domain not in DOMAIN_KEYWORDS:
            return jsonify({
                'success': False,
                'error': 'Invalid domain'
            }), 400
        
        # Include papers fetched today or promoted for today
        papers = list(papers_collection.find(
            {
                '$or': [{'fetchedDate': today_str}, {'promotedDates': today_str}],
                'domains': domain
            },
            {'_id': 0}
        ).sort('publishedDate', -1).limit(10))  # Limit to 10 papers per domain
        
        papers = [serialize_dates(p) for p in papers]
        
        return jsonify({
            'success': True,
            'papers': papers,
            'count': len(papers),
            'domain': domain,
            'fetchDate': today_str
        })
    except Exception as e:
        logger.error(f"Error in get_papers_by_domain: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/domain-stats', methods=['GET'])
def get_domain_stats():
    """Get domain-specific statistics"""
    try:
        today = datetime.now().date()
        today_str = today.isoformat()
        
        # Get the last update statistics
        last_update = db['update_stats'].find_one(
            sort=[('timestamp', -1)]
        )
        
        # Get current counts per domain
        domain_counts = {}
        for domain in DOMAIN_KEYWORDS.keys():
            count = papers_collection.count_documents({
                'fetchedDate': today_str,
                'domains': domain
            })
            domain_counts[domain] = count
        
        return jsonify({
            'success': True,
            'domain_counts': domain_counts,
            'last_update': {
                'timestamp': last_update['timestamp'].isoformat() if last_update else None,
                'papers_added': last_update['total_papers'] if last_update else 0,
                'domain_stats': last_update['domain_stats'] if last_update else {}
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics"""
    try:
        today = datetime.now().date()
        today_str = today.isoformat()
        total_papers_today = papers_collection.count_documents({'fetchedDate': today_str})
        total_papers = papers_collection.count_documents({})
        
        return jsonify({
            'success': True,
            'papers_today': total_papers_today,
            'total_papers': total_papers,
            'last_updated': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Initialize scheduler
scheduler = BackgroundScheduler()

# Schedule hourly updates
scheduler.add_job(
    fetch_and_store_papers,
    trigger=CronTrigger(minute=0, timezone='UTC'),  # Run at the start of every hour
    id='hourly_paper_fetch',
    name='Hourly Paper Fetch from CORE API',
    replace_existing=True
)

# Also run on app startup
def startup_job():
    logger.info("App started - Running initial paper fetch...")
    fetch_and_store_papers()

scheduler.add_job(
    startup_job,
    trigger='date',
    run_date=datetime.now() + timedelta(seconds=2),
    id='startup_fetch',
    replace_existing=True
)

scheduler.start()

if __name__ == '__main__':
    try:
        app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
