from pymongo import MongoClient
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

MONGODB_ATLAS_URI = os.getenv('MONGODB_ATLAS_URI')
client = MongoClient(MONGODB_ATLAS_URI)
db = client['research_papers']
papers_collection = db['papers']

today_str = datetime.now().date().isoformat()
print(f"Checking papers for date: {today_str}")

total_today = papers_collection.count_documents({'fetchedDate': today_str})
print(f"Total papers fetched today: {total_today}")

domains = [
    'artificial_intelligence',
    'computer_vision',
    'data_science',
    'cloud_computing',
    'cybersecurity',
    'software_engineering',
    'high_performance_computing'
]

for domain in domains:
    count = papers_collection.count_documents({
        'fetchedDate': today_str,
        'domains': domain
    })
    print(f"Domain '{domain}': {count} papers")
    
    # Check source
    arxiv_count = papers_collection.count_documents({
        'fetchedDate': today_str,
        'domains': domain,
        'source': 'arxiv'
    })
    print(f"  - From arXiv: {arxiv_count}")

print("\nSample Paper:")
sample = papers_collection.find_one({'fetchedDate': today_str, 'source': 'arxiv'})
if sample:
    print(f"Title: {sample.get('title')}")
    print(f"Source: {sample.get('source')}")
    print(f"Domains: {sample.get('domains')}")
else:
    print("No arXiv papers found today.")
