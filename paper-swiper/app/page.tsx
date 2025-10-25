'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Paper {
  id: string;
  title: string;
  tldr: string;
  url: string;
}

interface SwipeCardProps {
  paper: Paper;
  onSwipe: (direction: string, title: string) => void;
  onCardLeftScreen: (id: string) => void;
  index: number;
}

const SwipeCard: React.FC<SwipeCardProps> = ({ paper, onSwipe, onCardLeftScreen, index }) => {
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleStart = (clientX: number, clientY: number) => {
    setDragStart({ x: clientX, y: clientY });
    setDragCurrent({ x: clientX, y: clientY });
    setIsDragging(true);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setDragCurrent({ x: clientX, y: clientY });
  };

  const handleEnd = () => {
    if (!isDragging) return;
    
    const deltaX = dragCurrent.x - dragStart.x;
    const deltaY = dragCurrent.y - dragStart.y;
    const threshold = 100;

    setIsDragging(false);
    setIsAnimating(true);

    if (Math.abs(deltaX) > threshold) {
      const direction = deltaX > 0 ? 'right' : 'left';
      onSwipe(direction, paper.title);
      
      // Animate card out
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${deltaX > 0 ? '100vw' : '-100vw'}) rotate(${deltaX > 0 ? '30deg' : '-30deg'})`;
        cardRef.current.style.transition = 'transform 0.3s ease-out';
      }
      
      setTimeout(() => {
        onCardLeftScreen(paper.id);
      }, 300);
    } else {
      // Snap back to center
      if (cardRef.current) {
        cardRef.current.style.transform = 'translateX(0) rotate(0)';
        cardRef.current.style.transition = 'transform 0.3s ease-out';
      }
      setTimeout(() => {
        setIsAnimating(false);
        if (cardRef.current) {
          cardRef.current.style.transition = '';
        }
      }, 300);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  const deltaX = dragCurrent.x - dragStart.x;
  const deltaY = dragCurrent.y - dragStart.y;
  const rotation = deltaX * 0.1;
  const opacity = isDragging ? Math.max(0.5, 1 - Math.abs(deltaX) / 200) : 1;

  const transform = isDragging && !isAnimating 
    ? `translateX(${deltaX}px) translateY(${deltaY * 0.1}px) rotate(${rotation}deg)`
    : '';

  return (
    <div
      ref={cardRef}
      className="absolute w-full h-full cursor-grab active:cursor-grabbing"
      style={{
        transform,
        opacity,
        zIndex: 100 - index,
        transition: isAnimating ? 'transform 0.3s ease-out' : '',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="card bg-white rounded-2xl shadow-lg p-6 h-96 flex flex-col">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-800 mb-4 leading-tight">
            {paper.title}
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            {paper.tldr}
          </p>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-100">
          <a 
            href={paper.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            Read Full Paper →
          </a>
        </div>
      </div>
    </div>
  );
};

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDirection, setLastDirection] = useState<string>('');

  // Fetch the papers from our API
  useEffect(() => {
    const fetchPapers = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/get-cards');
        const data = await response.json();
        
        if (data.error) {
          setError(data.error);
        } else {
          setPapers(data.papers || []);
        }
      } catch (err) {
        setError('Failed to fetch papers');
        console.error('Error fetching papers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPapers();
  }, []);

  const swiped = (direction: string, title: string) => {
    setLastDirection(direction);
    console.log('You swiped: ' + direction + ' on ' + title);
  };

  const outOfFrame = (idToRemove: string) => {
    console.log(idToRemove + ' left the screen!');
    setPapers((prevPapers) => prevPapers.filter(p => p.id !== idToRemove));
  };

  const refreshPapers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/update-papers');
      if (response.ok) {
        // Refetch papers after updating
        const cardsResponse = await fetch('/api/get-cards');
        const data = await cardsResponse.json();
        setPapers(data.papers || []);
      }
    } catch (err) {
      setError('Failed to refresh papers');
    } finally {
      setLoading(false);
    }
  };

  if (loading && papers.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading research papers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Papers</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={refreshPapers}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">PaperSwiper</h1>
            <button 
              onClick={refreshPapers}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        <div className="cardContainer relative">
          {papers.length > 0 ? (
            papers.map((paper, index) => (
              <SwipeCard
                key={paper.id}
                paper={paper}
                onSwipe={swiped}
                onCardLeftScreen={outOfFrame}
                index={index}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📚</div>
              <h2 className="text-xl font-semibold text-gray-600 mb-2">No More Papers</h2>
              <p className="text-gray-500 mb-4">You've swiped through all available papers!</p>
              <button 
                onClick={refreshPapers}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Load More Papers
              </button>
            </div>
          )}
        </div>

        {/* Instructions */}
        {papers.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
              Swipe left to skip • Swipe right to save
            </p>
            {lastDirection && (
              <p className="text-indigo-600 text-sm mt-2">
                Last swipe: {lastDirection === 'left' ? 'Skipped' : 'Saved'}!
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}