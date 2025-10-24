// In app/api/get-cards/route.js
import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME);
    const papers = await db
      .collection('papers')
      .aggregate([{ $sample: { size: 10 } }]) // Gets 10 random documents
      .toArray();

    return NextResponse.json({ papers: papers });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}