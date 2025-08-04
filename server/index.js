require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Gemini AI setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware to verify JWT
const authenticateJWT = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Generate PDF report
app.post('/api/generate-report', authenticateJWT, async (req, res) => {
  try {
    const { month, year, transactions, summary } = req.body;
    
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=expense-report-${month}-${year}.pdf`);
    doc.pipe(res);

    // Add title
    doc.fontSize(20).text(`Expense Report - ${month}/${year}`, { align: 'center' });
    doc.moveDown();

    // Add summary
    doc.fontSize(14).text('AI-Generated Summary:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(summary);
    doc.moveDown();

    // Add transactions table
    doc.fontSize(14).text('Transaction Details:', { underline: true });
    doc.moveDown(0.5);
    
    // Table header
    doc.font('Helvetica-Bold');
    doc.text('Date', 50, doc.y);
    doc.text('Category', 150, doc.y);
    doc.text('Description', 250, doc.y);
    doc.text('Amount', 400, doc.y, { width: 100, align: 'right' });
    doc.moveDown();
    doc.font('Helvetica');

    // Table rows
    let total = 0;
    transactions.forEach(t => {
      total += t.amount;
      doc.text(new Date(t.date).toLocaleDateString(), 50, doc.y);
      doc.text(t.category_name, 150, doc.y);
      doc.text(t.description || '-', 250, doc.y, { width: 150 });
      doc.text(`$${t.amount.toFixed(2)}`, 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown();
    });

    // Add total
    doc.moveDown();
    doc.font('Helvetica-Bold').text(`Total Expenses: $${total.toFixed(2)}`, { align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Get AI insights
app.post('/api/generate-insights', authenticateJWT, async (req, res) => {
  try {
    const { transactions, month, year } = req.body;

    // Validate input
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid transactions data' });
    }

    if (transactions.length === 0) {
      return res.json({ insights: "No transactions available for analysis" });
    }

    // Initialize Gemini API
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Create structured prompt
    const prompt = `Analyze this student's spending for ${month} ${year}:
    
    Transaction Data:
    ${JSON.stringify(transactions.slice(0, 20), null, 2)} 
    ${transactions.length > 20 ? `\n(Showing 20 of ${transactions.length} transactions)` : ''}

    Provide a concise summary (150-200 words) with:
    1. Top 3 spending categories
    2. Weekly spending patterns
    3. Potential savings opportunities
    4. One specific recommendation`;

    console.log("Sending to Gemini:", prompt); // Debug log

    // Generate content with error handling
    const result = await model.generateContent(prompt).catch(err => {
      console.error("Gemini API error:", err);
      throw new Error("AI service unavailable");
    });

    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error("Empty response from AI");
    }

    res.json({ 
      insights: text,
      meta: {
        transactionCount: transactions.length,
        period: `${month} ${year}`
      }
    });

  } catch (error) {
    console.error("Error in generate-insights:", error);
    res.status(500).json({ 
      error: error.message || "Analysis failed",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});