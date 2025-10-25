import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const client = await clientPromise;
    
    if (!client) {
      return NextResponse.json({ 
        error: 'MongoDB connection not configured',
        message: 'Please configure MONGODB_URI environment variable'
      });
    }

    const db = client.db(process.env.DB_NAME || 'paperswiper');
    const collection = db.collection('papers');

    // Create a unique index on the 'id' field to prevent duplicates
    await collection.createIndex({ id: 1 }, { unique: true });

    // 1. Fetch new papers from Semantic Scholar
    const res = await fetch(
      'https://api.semanticscholar.org/graph/v1/paper/search/bulk' +
      '?query=machine+learning+OR+artificial+intelligence+OR+deep+learning&fields=title,url,tldr&sort=publicationDate:desc&limit=50'
    );
    
    if (!res.ok) {
      throw new Error(`Semantic Scholar API error: ${res.status}`);
    }
    
    const data = await res.json();
    const papers = data.data || [];

    let insertedCount = 0;
    let updatedCount = 0;

    // 2. Insert them into the database
    for (const paper of papers) {
      if (paper.tldr && paper.paperId && paper.title) {
        // Use paperId as the main identifier
        const filter = { id: paper.paperId };
        
        // Data to be inserted or updated
        const updateDoc = {
          $set: {
            id: paper.paperId,
            title: paper.title,
            tldr: paper.tldr.text || paper.tldr,
            url: paper.url,
            addedAt: new Date(),
          },
        };

        // 'upsert: true' inserts the document if it doesn't exist
        const result = await collection.updateOne(filter, updateDoc, { upsert: true });
        
        if (result.upsertedCount > 0) {
          insertedCount++;
        } else if (result.modifiedCount > 0) {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({ 
      message: 'Success',
      inserted: insertedCount,
      updated: updatedCount,
      totalProcessed: papers.length
    });
  } catch (error) {
    console.error('Error updating papers:', error);
    return NextResponse.json({ 
      error: 'Failed to update papers',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}