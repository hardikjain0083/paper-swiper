# PaperSwiper - Research Paper Summarizer

A modern web application that allows users to discover and explore research papers through an Inshorts-style swipe interface. Built with Next.js, MongoDB, and Tailwind CSS.

## Features

- 🔄 Swipe-based interface for browsing research papers
- 📱 Mobile-responsive design
- 🤖 AI-powered paper summaries from Semantic Scholar
- 💾 MongoDB backend for data persistence
- ⚡ Real-time paper updates
- 🎨 Modern, clean UI design

## Prerequisites

- Node.js 18+ 
- MongoDB Atlas account (free tier available)
- Git

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd paper-swiper
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=paperswiper

# Next.js Configuration
NODE_ENV=development
```

**To get your MongoDB URI:**
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster
4. Go to "Database Access" and create a user
5. Go to "Network Access" and add your IP (or 0.0.0.0/0 for all IPs)
6. Click "Connect" on your cluster and copy the connection string
7. Replace `<username>` and `<password>` with your database credentials

### 4. Initialize Database

Run the application and visit `/api/update-papers` to populate your database with initial papers:

```bash
npm run dev
```

Then visit: `http://localhost:3000/api/update-papers`

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Browse Papers**: Swipe left to skip papers, swipe right to save them
2. **Read Summaries**: Each card shows the paper title and AI-generated summary
3. **Access Full Papers**: Click "Read Full Paper →" to open the original paper
4. **Refresh Content**: Use the "Refresh" button to load new papers

## API Endpoints

- `GET /api/get-cards` - Fetch random papers for swiping
- `GET /api/update-papers` - Fetch and store new papers from Semantic Scholar

## Deployment on Vercel

### 1. Prepare for Deployment

1. Push your code to GitHub
2. Ensure your `.env.local` is not committed (it's in `.gitignore`)

### 2. Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Sign in with your GitHub account
3. Click "New Project"
4. Import your repository
5. Add environment variables in Vercel dashboard:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `DB_NAME`: Your database name (e.g., "paperswiper")
6. Click "Deploy"

### 3. Post-Deployment Setup

After deployment, visit `https://your-app.vercel.app/api/update-papers` to initialize your database.

## Project Structure

```
paper-swiper/
├── app/
│   ├── api/
│   │   ├── get-cards/route.js      # API to fetch papers
│   │   └── update-papers/route.js  # API to update papers
│   ├── globals.css                 # Global styles
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Main page component
├── lib/
│   └── mongodb.js                  # MongoDB connection
├── public/                         # Static assets
└── package.json                    # Dependencies
```

## Technologies Used

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: MongoDB Atlas
- **Swipe Interface**: react-tinder-card
- **Deployment**: Vercel

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for learning and development.

## Support

If you encounter any issues:
1. Check the browser console for errors
2. Verify your MongoDB connection
3. Ensure all environment variables are set correctly
4. Check the API endpoints are working: `/api/get-cards` and `/api/update-papers`