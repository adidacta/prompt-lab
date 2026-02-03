const Anthropic = require('@anthropic-ai/sdk').default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

module.exports = async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: messages
    });

    // Extract text content from response
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return res.status(200).json({
      content: textContent,
      usage: response.usage
    });
  } catch (error) {
    console.error('API Error:', error);

    // Handle rate limiting
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again in a moment.'
      });
    }

    // Handle authentication errors
    if (error.status === 401) {
      return res.status(401).json({
        error: 'API authentication failed. Please check your API key.'
      });
    }

    return res.status(500).json({
      error: error.message || 'An error occurred while generating content.'
    });
  }
};
