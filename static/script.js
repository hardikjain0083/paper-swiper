let papers = [];
let currentIndex = 0;
let startX = 0;
let currentX = 0;
let isDragging = false;
let currentDomain = null;

const cardContainer = document.getElementById('cardContainer');
const paperStatus = document.getElementById('paperStatus');
const domainGrid = document.getElementById('domainGrid');

// Fetch domain statistics
async function fetchDomainStats() {
    try {
        const response = await fetch('/api/domain-stats');
        const data = await response.json();
        
        if (data.success) {
            const { domain_counts, last_update } = data;
            const updateTime = new Date(last_update.timestamp).toLocaleTimeString();
            document.getElementById('lastUpdateTime').textContent = `Last Update: ${updateTime}`;
            
            // Update domain cards with counts and new papers
            Object.entries(domain_counts).forEach(([domain, count]) => {
                const newPapers = last_update.domain_stats[domain] || 0;
                const card = document.querySelector(`[data-domain="${domain}"]`);
                if (card) {
                    const statsDiv = card.querySelector('.domain-stats') || document.createElement('div');
                    statsDiv.className = 'domain-stats';
                    statsDiv.innerHTML = `
                        <span>${count} papers total</span>
                        ${newPapers > 0 ? `<span class="new-papers">+${newPapers} new</span>` : ''}
                    `;
                    if (!card.querySelector('.domain-stats')) {
                        card.insertBefore(statsDiv, card.querySelector('button'));
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error fetching domain stats:', error);
    }
}

// Fetch available domains
async function fetchDomains() {
    try {
        const response = await fetch('/api/domains');
        const data = await response.json();
        
        if (data.success) {
            const domains = data.domains;
            domainGrid.innerHTML = domains.map(domain => `
                <div class="domain-card" data-domain="${domain.id}">
                    <h3>${domain.name}</h3>
                    <div class="domain-stats">Loading stats...</div>
                    <button onclick="selectDomain('${domain.id}')">View Papers</button>
                </div>
            `).join('');
            
            // Fetch initial stats
            fetchDomainStats();
        }
    } catch (error) {
        console.error('Error fetching domains:', error);
        domainGrid.innerHTML = '<div class="error">Error loading domains. Please refresh.</div>';
    }
}

// Fetch papers for selected domain
async function fetchPapers(domain) {
    try {
        paperStatus.textContent = 'Loading papers...';
        const response = await fetch(`/api/papers/${domain}`);
        const data = await response.json();
        
        if (data.success) {
            papers = data.papers;
            if (papers.length > 0) {
                paperStatus.textContent = `${papers.length} papers available today • Swipe to explore`;
                renderCard();
                updateStats();
            } else {
                showNoMorePapers();
            }
        }
    } catch (error) {
        console.error('Error fetching papers:', error);
        cardContainer.innerHTML = '<div class="loading">Error loading papers. Please refresh.</div>';
    }
}

// Update statistics
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        if (data.success) {
            const lastUpdate = new Date(data.last_updated).toLocaleTimeString('en-IN');
            paperStatus.textContent = `${data.papers_today} papers today • Last updated: ${lastUpdate}`;
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

// Render current card
function renderCard() {
    if (currentIndex >= papers.length) {
        showNoMorePapers();
        return;
    }
    
    const paper = papers[currentIndex];
    const card = document.createElement('div');
    card.className = 'card';
    
    const authors = paper.authors && paper.authors.length > 0 
        ? paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ', et al.' : '')
        : 'Unknown authors';
    
    const downloadLink = paper.downloadUrl || (paper.sourceFulltextUrls && paper.sourceFulltextUrls[0]) || '';
    const publishDate = new Date(paper.publishedDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
    
    let keywordsHTML = '';
    if (paper.keywords && paper.keywords.length > 0) {
        keywordsHTML = `
            <div class="card-keywords">
                ${paper.keywords.map(kw => `<span class="keyword">${kw}</span>`).join('')}
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="card-header">
            <span class="card-badge">Today's Paper ${paper.pageCount ? '• ' + paper.pageCount + 'p' : ''}</span>
        </div>
        <div class="card-title">${paper.title}</div>
        <div class="card-authors">by ${authors}</div>
        <div class="card-meta">
            <div class="card-meta-item">📅 ${publishDate}</div>
            ${paper.doi ? `<div class="card-meta-item">🔗 DOI</div>` : ''}
        </div>
        <div class="card-abstract">${paper.abstract}</div>
        ${keywordsHTML}
        <div class="card-footer">
            ${downloadLink ? `<a href="${downloadLink}" target="_blank" class="card-link">📄 Read Paper</a>` : ''}
        </div>
    `;
    
    // Add touch/mouse event listeners
    card.addEventListener('mousedown', handleStart);
    card.addEventListener('touchstart', handleStart);
    
    cardContainer.innerHTML = '';
    cardContainer.appendChild(card);
}

// Handle drag start
function handleStart(e) {
    isDragging = true;
    startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
    
    const card = e.currentTarget;
    card.classList.add('swiping');
}

// Handle drag move
function handleMove(e) {
    if (!isDragging) return;
    
    currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
    const deltaX = currentX - startX;
    const card = cardContainer.querySelector('.card');
    
    if (card) {
        const rotation = deltaX * 0.12;
        card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
    }
}

// Handle drag end
function handleEnd(e) {
    if (!isDragging) return;
    
    isDragging = false;
    const deltaX = currentX - startX;
    const card = cardContainer.querySelector('.card');
    
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchend', handleEnd);
    
    if (Math.abs(deltaX) > 120) {
        if (deltaX > 0) {
            swipeRight(card);
        } else {
            swipeLeft(card);
        }
    } else {
        // Reset card position
        card.style.transform = '';
        card.classList.remove('swiping');
    }
}

// Swipe right
function swipeRight(card) {
    card.classList.add('swiped-right');
    setTimeout(() => {
        currentIndex++;
        renderCard();
    }, 400);
}

// Swipe left
function swipeLeft(card) {
    card.classList.add('swiped-left');
    setTimeout(() => {
        currentIndex++;
        renderCard();
    }, 400);
}

// Show no more papers message
function showNoMorePapers() {
    cardContainer.innerHTML = `
        <div class="no-more-papers">
            ✨ All papers for today reviewed!
            <span>New papers will be added tomorrow at midnight</span>
        </div>
    `;
    paperStatus.textContent = 'All papers reviewed - Check back tomorrow!';
}

// Select domain and fetch its papers
function selectDomain(domain) {
    currentDomain = domain;
    currentIndex = 0;
    papers = [];
    cardContainer.innerHTML = '<div class="loading">Fetching papers for selected domain...</div>';
    fetchPapers(domain);
    
    // Update UI to show selected domain
    document.querySelectorAll('.domain-card').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.domain === domain) {
            card.classList.add('selected');
        }
    });
}

// Initialize
fetchDomains();

// Set up auto-refresh (every hour)
setInterval(() => {
    fetchDomainStats();
    if (currentDomain) {
        fetchPapers(currentDomain);
    }
}, 60 * 60 * 1000);  // 1 hour in milliseconds

// Set up stats refresh (every minute to update "time since last update")
setInterval(() => {
    const lastUpdateSpan = document.getElementById('lastUpdateTime');
    if (lastUpdateSpan && lastUpdateSpan.dataset.timestamp) {
        const lastUpdate = new Date(lastUpdateSpan.dataset.timestamp);
        const now = new Date();
        const minutesAgo = Math.floor((now - lastUpdate) / (1000 * 60));
        
        if (minutesAgo < 60) {
            lastUpdateSpan.textContent = `Last Update: ${minutesAgo} minute${minutesAgo === 1 ? '' : 's'} ago`;
        } else {
            lastUpdateSpan.textContent = `Last Update: ${lastUpdate.toLocaleTimeString()}`;
        }
    }
}, 60 * 1000);  // 1 minute in milliseconds
