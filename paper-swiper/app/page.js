// In app/page.js
'use client'; // This is required for user interaction in Next.js

import React, { useState, useEffect, useMemo } from 'react';
import TinderCard from 'react-tinder-card';
import './globals.css'; // You'll need to add styles here

export default function Home() {
  const [papers, setPapers] = useState([]);

  // Fetch the papers from our own API
  useEffect(() => {
    fetch('/api/get-cards')
      .then((res) => res.json())
      .then((data) => setPapers(data.papers || []));
  }, []);

  const swiped = (direction, title) => {
    console.log('You swiped: ' + direction + ' on ' + title);
  };

  const outOfFrame = (idToRemove) => {
    console.log(idToRemove + ' left the screen!');
    // Remove the card from the state so the next one appears
    setPapers((prevPapers) => prevPapers.filter(p => p.id !== idToRemove));
  };

  return (
    <div className="cardContainer">
      {papers.map((paper) => (
        <TinderCard
          className="swipe"
          key={paper.id}
          onSwipe={(dir) => swiped(dir, paper.title)}
          onCardLeftScreen={() => outOfFrame(paper.id)}
        >
          <div className="card">
            <h3>{paper.title}</h3>
            {/* Note: MongoDB stores _id, but we are using our custom 'id' */}
            <p>{paper.tldr}</p> {/* This is your "short para" */}
          </div>
        </TinderCard>
      ))}
      {papers.length === 0 && <h2>Loading cards...</h2>}
    </div>
  );
}