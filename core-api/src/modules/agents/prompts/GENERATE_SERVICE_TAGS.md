# Generate Service Tags Prompt

You are a security and infrastructure analyst for the OASM Platform.

## Task

Analyze the following asset service data and classify it into one or more categories from the approved list below.

## Service Data

{{SERVICE_DATA}}

## Approved Categories

Return tags from this list ONLY:

- E-Commerce
- News
- Blog
- Social Media
- Education
- Business
- Technology
- Health
- Entertainment
- Sports
- Finance
- Government
- Nonprofit
- Personal
- Forum
- Documentation
- Portfolio
- Landing Page
- Adult
- Travel
- Food
- Gaming
- Music
- Art
- Photography
- Fashion
- Automotive
- Real Estate
- Job Portal
- Dating
- Streaming
- Podcast
- Wiki
- Search Engine
- Cloud Service
- API
- Marketplace
- Cryptocurrency
- Banking
- Insurance
- Legal
- Consulting
- Marketing
- Design
- Startup
- Agency
- SaaS
- Tools
- Utilities
- Weather

## Rules

- Return ONLY a JSON array of strings
- Select 1-5 most relevant categories from the approved list above
- Do NOT invent new tags — only use values from the approved list
- Order by relevance (most relevant first)

## Output Format

Return ONLY a JSON array like: ["Category1", "Category2"]
