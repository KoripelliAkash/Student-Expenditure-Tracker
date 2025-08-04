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
      doc.text(t.category_name || t.category, 150, doc.y);
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

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid transactions data' });
    }

    if (transactions.length === 0) {
      return res.json({ insights: "No transactions available for analysis" });
    }

    // Initialize with correct model name - use gemini-1.5-flash for better stability
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash"
    });

    // Calculate category totals for better analysis
    const categoryTotals = {};
    let totalAmount = 0;
    
    transactions.forEach(t => {
      const category = t.category || t.category_name || 'Other';
      categoryTotals[category] = (categoryTotals[category] || 0) + t.amount;
      totalAmount += t.amount;
    });

    // Get top 3 categories
    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Create comprehensive prompt with markdown formatting instructions
    const prompt = `Analyze this student's expenses for ${month} ${year}:

SPENDING SUMMARY:
• Total Spent: ${totalAmount.toFixed(2)}
• Number of Transactions: ${transactions.length}
• Top Categories: ${topCategories.map(([cat, amt]) => `${cat} (${amt.toFixed(2)})`).join(', ')}

TRANSACTION DETAILS:
${transactions.map(t => 
  `• ${t.date}: ${t.category || t.category_name} - ${t.amount} (${t.description || 'No description'})`
).join('\n')}

Please provide a concise analysis (150-200 words maximum) in MARKDOWN format covering:
1. Top 3 spending categories with percentages
2. Weekly spending pattern observations
3. 2-3 specific money-saving opportunities 
4. One actionable budgeting recommendation

IMPORTANT: Format your response using proper markdown syntax:
- Use ## for main headings
- Use ### for subheadings
- Use - or * for bullet points
- Use **bold** for emphasis
- Use \`code\` for amounts
- Use emojis to make it engaging

Example format:
## 📊 Expense Analysis for ${month} ${year}

### 💰 Top Spending Categories
- **Category Name**: \$XX.XX (XX%)
- **Category Name**: \$XX.XX (XX%)

### 📈 Spending Patterns
- Weekly observation...

### 💡 Money-Saving Opportunities
- Specific recommendation...

### 🎯 Budget Recommendation
- Actionable advice...`;

    console.log('Sending request to Gemini API...');
    const result = await model.generateContent(prompt);
    
    if (!result || !result.response) {
      throw new Error('No response from Gemini API');
    }
    
    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from Gemini API');
    }

    console.log('Successfully received Gemini response');
    res.json({ 
      insights: text,
      success: true,
      metadata: {
        totalTransactions: transactions.length,
        totalAmount: totalAmount.toFixed(2),
        topCategories: topCategories.map(([cat, amt]) => ({ category: cat, amount: amt.toFixed(2) }))
      }
    });

  } catch (error) {
    console.error("Gemini API Error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Provide fallback analysis
    const fallbackAnalysis = getFallbackAnalysis(req.body.transactions, req.body.month, req.body.year);
    
    res.status(200).json({ // Changed to 200 since we're providing fallback
      insights: fallbackAnalysis,
      success: false,
      fallback: true,
      error: "AI analysis temporarily unavailable - showing basic analysis"
    });
  }
});

// Enhanced fallback analysis with markdown formatting
function getFallbackAnalysis(transactions, month, year) {
  if (!transactions || transactions.length === 0) {
    return "## ❌ No Data Available\n\nNo transaction data available for analysis.";
  }

  const categories = {};
  let totalAmount = 0;
  
  transactions.forEach(t => {
    const category = t.category || t.category_name || 'Other';
    categories[category] = (categories[category] || 0) + t.amount;
    totalAmount += t.amount;
  });
  
  const topCategories = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const averageTransaction = totalAmount / transactions.length;
  
  // Calculate weekly pattern if we have dates
  const weeklySpending = {};
  transactions.forEach(t => {
    if (t.date) {
      const date = new Date(t.date);
      const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
      const weekKey = weekStart.toISOString().split('T')[0];
      weeklySpending[weekKey] = (weeklySpending[weekKey] || 0) + t.amount;
    }
  });

  const weeks = Object.keys(weeklySpending).length;
  const avgWeeklySpend = weeks > 0 ? totalAmount / weeks : totalAmount;

  return `## 📊 Expense Analysis for ${month} ${year}

### 💰 Spending Overview
- **Total Expenses**: \`${totalAmount.toFixed(2)}\`
- **Number of Transactions**: \`${transactions.length}\`
- **Average per Transaction**: \`${averageTransaction.toFixed(2)}\`${weeks > 1 ? `\n- **Average Weekly Spend**: \`${avgWeeklySpend.toFixed(2)}\`` : ''}

### 📈 Top Spending Categories
${topCategories.map(([cat, amt], i) => 
  `${i + 1}. **${cat}**: \`${amt.toFixed(2)}\` *(${((amt/totalAmount) * 100).toFixed(1)}%)*`
).join('\n')}

### 💡 Money-Saving Opportunities
- **Track Daily Expenses**: Monitor small recurring costs that add up over time
- **Set Weekly Budget**: Aim for \`${(avgWeeklySpend * 0.9).toFixed(2)}\` per week to save 10%
- **Review Top Category**: Analyze your **${topCategories[0]?.[0]}** spending for potential cuts

### 🎯 Budget Recommendation
Consider using the **50/30/20 budgeting rule**:
- 50% for needs
- 30% for wants  
- 20% for savings

This helps build better financial habits and ensures you're saving for the future.

---
*⚠️ Note: This is a basic analysis. AI-powered insights will be available when the service is restored.*`;
}

// CORS configuration (commented out the restrictive one)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['POST', 'GET', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    geminiModel: 'gemini-1.5-flash'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Using Gemini model: gemini-1.5-flash`);
});