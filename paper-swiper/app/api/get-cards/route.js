import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const client = await clientPromise;
    
    if (!client) {
      return NextResponse.json({ 
        error: 'MongoDB connection not configured',
        papers: []
      });
    }

    const db = client.db(process.env.DB_NAME || 'paperswiper');
    const papers = await db
      .collection('papers')
      .aggregate([{ $sample: { size: 10 } }]) // Gets 10 random documents
      .toArray();

    // Ensure papers have required fields
    const validPapers = papers.filter(paper => 
      paper.title && paper.tldr && paper.id
    );

    return NextResponse.json({ 
      papers: validPapers,
      count: validPapers.length 
    });
  } catch (error) {
    console.error('Error fetching papers:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch papers',
      papers: [],
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}