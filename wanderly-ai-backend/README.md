## Wanderly AI Backend

Node.js + Express API with PostgreSQL and OpenAI integration.

### Tech
- Node.js + Express
- PostgreSQL (`pg`)
- OpenAI API (`openai`)
- dotenv
- CORS + body-parser

### Setup
1. Create `.env` in `wanderly-ai-backend/`:

```
PORT=5000

OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=your_postgres_connection_url
YELP_API_KEY=your_yelp_api_key_here
```

2. Install dependencies:
```
npm install
```

3. Run dev server:
```
npm run dev
```

### Endpoints
- Health: `GET /health`
- AI Search: `POST /api/ai/search` { query, language? }
  - Optional Yelp integration with `YELP_API_KEY`. Fallbacks to DB if not set.
- Places:
  - `GET /api/places`
  - `GET /api/places/:id`
  - `POST /api/places`
  - `PUT /api/places/:id`
  - `DELETE /api/places/:id`
- Comments:
  - `GET /api/comments/:placeId`
  - `POST /api/comments`
  - `DELETE /api/comments/:id`

### Example Tables (SQL)
You can start with these:
```sql
CREATE TABLE places (
  id SERIAL PRIMARY KEY,
  name_en VARCHAR(255),
  name_vi VARCHAR(255),
  category VARCHAR(100),
  description_en TEXT,
  description_vi TEXT,
  latitude FLOAT,
  longitude FLOAT,
  user_created BOOLEAN DEFAULT false,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  place_id INT REFERENCES places(id) ON DELETE CASCADE,
  user_name VARCHAR(100),
  comment TEXT,
  rating INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```


