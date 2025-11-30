let papers = [];
let currentIndex = 0;
let startX = 0;
let currentX = 0;
let isDragging = false;
let currentDomain = null;

const cardContainer = document.getElementById('cardContainer');
const paperStatus = document.getElementById('paperStatus');
const domainGrid = document.getElementById('domainGrid');
const refreshBtn = document.getElementById('refreshFeedBtn');

/* ========== API CALLS ========== */

// Fetch domain statistics
async function fetchDomainStats() {
    try {
        const response = await fetch('/api/domain-stats');
        const data = await response.json();

        if (data.success) {
            const { domain_counts, last_update } = data;

            if (last_update && last_update.timestamp) {
                const lastUpdateElem = document.getElementById('lastUpdateTime');
                const updateTime = new Date(last_update.timestamp).toLocaleTimeString();
                lastUpdateElem.textContent = `Last Update: ${updateTime}`;
                // store raw timestamp for "x minutes ago" text
                lastUpdateElem.dataset.timestamp = last_update.timestamp;
            }

            // Update domain cards with counts and new papers
            Object.entries(domain_counts).forEach(([domain, count]) => {
                const newPapers = last_update.domain_stats[domain] || 0;
                const card = document.querySelector(`[data-domain="${domain}"]`);
                if (card) {
                    const existingStats = card.querySelector('.domain-stats');
                    const statsDiv = existingStats || document.createElement('div');
                    statsDiv.className = 'domain-stats';
                    statsDiv.innerHTML = `
                        <span>${count} papers total</span>
                        ${
                            newPapers > 0
                                ? `<span class="new-papers">+${newPapers} new</span>`
                                : ''
                        }
                    `;
                    if (!existingStats) {
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
            domainGrid.innerHTML = domains
                .map(
                    (domain) => `
                <div class="domain-card" data-domain="${domain.id}">
                    <h3>${domain.name}</h3>
                    <div class="domain-stats">Loading stats...</div>
                    <button onclick="selectDomain('${domain.id}')">View Papers</button>
                </div>
            `
                )
                .join('');

            // Fetch initial stats
            fetchDomainStats();
        }
    } catch (error) {
        console.error('Error fetching domains:', error);
        domainGrid.innerHTML =
            '<div class="loading">Error loading domains. Please refresh.</div>';
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
                currentIndex = 0;
                renderCard();
            } else {
                showNoMorePapers();
            }
        }
    } catch (error) {
        console.error('Error fetching papers:', error);
        cardContainer.innerHTML =
            '<div class="loading">Error loading papers. Please refresh.</div>';
    }
}

// Update global stats
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

/* ========== CARD RENDERING & SWIPING ========== */

function renderCard() {
    if (currentIndex >= papers.length) {
        showNoMorePapers();
        return;
    }

    const paper = papers[currentIndex];
    const card = document.createElement('div');
    card.className = 'card';

    const authors =
        paper.authors && paper.authors.length > 0
            ? paper.authors.slice(0, 3).join(', ') +
              (paper.authors.length > 3 ? ', et al.' : '')
            : 'Unknown authors';

    const downloadLink =
        paper.downloadUrl ||
        (paper.sourceFulltextUrls && paper.sourceFulltextUrls[0]) ||
        '';

    const publishDate = paper.publishedDate
        ? new Date(paper.publishedDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
          })
        : 'Unknown date';

    let keywordsHTML = '';
    if (paper.keywords && paper.keywords.length > 0) {
        keywordsHTML = `
            <div class="card-keywords">
                ${paper.keywords.map((kw) => `<span class="keyword">${kw}</span>`).join('')}
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-header">
            <span class="card-badge">
                Today's Paper ${paper.pageCount ? '• ' + paper.pageCount + 'p' : ''}
            </span>
        </div>
        <div class="card-title">${paper.title}</div>
        <div class="card-authors">by ${authors}</div>
        <div class="card-meta">
            <div class="card-meta-item">📅 ${publishDate}</div>
            ${paper.doi ? `<div class="card-meta-item">🔗 DOI</div>` : ''}
        </div>
        <div class="card-abstract">${paper.abstract || 'No abstract available.'}</div>
        ${keywordsHTML}
        <div class="card-footer">
            ${
                downloadLink
                    ? `<a href="${downloadLink}" target="_blank" class="card-link">📄 Read Paper</a>`
                    : ''
            }
        </div>
    `;

    // swipe events
    card.addEventListener('mousedown', handleStart);
    card.addEventListener('touchstart', handleStart, { passive: true });

    cardContainer.innerHTML = '';
    cardContainer.appendChild(card);
}

function handleStart(e) {
    isDragging = true;
    startX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);

    const card = cardContainer.querySelector('.card');
    if (card) card.classList.add('swiping');
}

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

function handleEnd() {
    if (!isDragging) return;
    isDragging = false;

    const deltaX = currentX - startX;
    const card = cardContainer.querySelector('.card');

    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchend', handleEnd);

    if (!card) return;

    if (Math.abs(deltaX) > 120) {
        if (deltaX > 0) {
            swipeRight(card);
        } else {
            swipeLeft(card);
        }
    } else {
        card.style.transform = '';
        card.classList.remove('swiping');
    }
}

function swipeRight(card) {
    card.classList.add('swiped-right');
    setTimeout(() => {
        currentIndex++;
        renderCard();
    }, 400);
}

function swipeLeft(card) {
    card.classList.add('swiped-left');
    setTimeout(() => {
        currentIndex++;
        renderCard();
    }, 400);
}

function showNoMorePapers() {
    cardContainer.innerHTML = `
        <div class="no-more-papers">
            ✨ All papers for today reviewed!
            <span>New papers will be added tomorrow at midnight</span>
        </div>
    `;
    paperStatus.textContent = 'All papers reviewed - Check back tomorrow!';
}

/* ========== DOMAIN SELECTION ========== */

function selectDomain(domain) {
    currentDomain = domain;
    currentIndex = 0;
    papers = [];
    cardContainer.innerHTML =
        '<div class="loading">Fetching papers for selected domain...</div>';
    fetchPapers(domain);

    document.querySelectorAll('.domain-card').forEach((card) => {
        card.classList.remove('selected');
        if (card.dataset.domain === domain) {
            card.classList.add('selected');
        }
    });
}

/* ========== INIT + TIMERS ========== */

fetchDomains();

// manual refresh button (optional)
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        fetchDomainStats();
        if (currentDomain) {
            fetchPapers(currentDomain);
        }
    });
}

// Auto refresh every hour
setInterval(() => {
    fetchDomainStats();
    if (currentDomain) {
        fetchPapers(currentDomain);
    }
}, 60 * 60 * 1000);

// "x minutes ago" text update every minute
setInterval(() => {
    const lastUpdateSpan = document.getElementById('lastUpdateTime');
    if (lastUpdateSpan && lastUpdateSpan.dataset.timestamp) {
        const lastUpdate = new Date(lastUpdateSpan.dataset.timestamp);
        const now = new Date();
        const minutesAgo = Math.floor((now - lastUpdate) / (1000 * 60));

        if (minutesAgo < 60) {
            lastUpdateSpan.textContent = `Last Update: ${minutesAgo} minute${
                minutesAgo === 1 ? '' : 's'
            } ago`;
        } else {
            lastUpdateSpan.textContent = `Last Update: ${lastUpdate.toLocaleTimeString()}`;
        }
    }
}, 60 * 1000);
=======

/* ========== REVIEWS MODAL & DYNAMIC ADD ========== */

const reviewModal = document.getElementById('reviewModal');
const openReviewModalBtn = document.getElementById('openReviewModalBtn');
const closeReviewModalBtn = document.getElementById('closeReviewModalBtn');
const cancelReviewBtn = document.getElementById('cancelReviewBtn');
const reviewModalBackdrop = document.getElementById('reviewModalBackdrop');
const reviewForm = document.getElementById('reviewForm');
const reviewsGrid = document.querySelector('.reviews-grid');

function openReviewModal() {
    if (!reviewModal) return;
    reviewModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeReviewModal() {
    if (!reviewModal) return;
    reviewModal.classList.remove('is-open');
    document.body.style.overflow = '';
}

function createReviewCard(name, role, text) {
    const article = document.createElement('article');
    article.className = 'review-card';
    article.innerHTML = `
        <img class="review-avatar"
             src="https://randomuser.me/api/portraits/lego/1.jpg"
             alt="User photo">
        <div class="review-body">
            <p class="review-text">“${text}”</p>
            <p class="review-meta">
                <span class="review-name">${name}</span>
                <span class="review-role">${role}</span>
            </p>
        </div>
    `;
    return article;
}

// open
if (openReviewModalBtn && reviewModal) {
    openReviewModalBtn.addEventListener('click', openReviewModal);
}

// close on buttons / backdrop
[closeReviewModalBtn, cancelReviewBtn, reviewModalBackdrop].forEach((el) => {
    if (el) el.addEventListener('click', closeReviewModal);
});

// close on Esc
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeReviewModal();
});

// handle submit
if (reviewForm && reviewsGrid) {
    reviewForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('reviewName').value.trim();
        const role = document.getElementById('reviewRole').value.trim();
        const text = document.getElementById('reviewText').value.trim();

        if (!name || !role || !text) return;

        const card = createReviewCard(name, role, text);
        reviewsGrid.appendChild(card);

        reviewForm.reset();
        closeReviewModal();
    });
}

