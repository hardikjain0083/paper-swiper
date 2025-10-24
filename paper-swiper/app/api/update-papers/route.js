// In app/api/update-papers/route.js
import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME);
    const collection = db.collection('papers');

    // Create a unique index on the 'id' field to prevent duplicates
    await collection.createIndex({ id: 1 }, { unique: true });

    // 1. Fetch new papers from Semantic Scholar
    const res = await fetch(
      'https://api.semanticscholar.org/graph/v1/paper/search/bulk' +
      '?query=machine+learning&fields=title,url,tldr&sort=publicationDate:desc&limit=50'
    );
    const data = await res.json();
    const papers = data.data;

    // 2. Insert them into the database
    for (const paper of papers) {
      if (paper.tldr && paper.paperId) {
        // Use paperId as the main identifier
        const filter = { id: paper.paperId };
        
        // Data to be inserted or updated
        const updateDoc = {
          $set: {
            id: paper.paperId,
            title: paper.title,
            tldr: paper.tldr.text,
            url: paper.url,
          },
        };

        // 'upsert: true' inserts the document if it doesn't exist
        await collection.updateOne(filter, updateDoc, { upsert: true });
      }
    }

    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}