import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/Reports.css';

function Reports() {
  const [transactions, setTransactions] = useState([]);
  const [transactionsByWeek, setTransactionsByWeek] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState('');
  const [error, setError] = useState(null);

  // Helper function to get week of month
  const getWeekOfMonth = (date) => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    return Math.ceil((dayOfMonth + firstDayOfMonth.getDay()) / 7);
  };

  useEffect(() => {
    fetchTransactions();
  }, [selectedMonth, selectedYear]);

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Create date range for the selected month/year
      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString();
      
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          date,
          description,
          receipt_url,
          category_id,
          categories!inner(
            name
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;

      // Format data to include category_name
      const formattedData = data.map(transaction => ({
        ...transaction,
        category_name: transaction.categories.name
      }));

      setTransactions(formattedData);

      // Group transactions by week
      const weeklyTransactions = {};
      formattedData.forEach(transaction => {
        const date = new Date(transaction.date);
        const weekNum = getWeekOfMonth(date);
        const weekKey = `Week ${weekNum}`;
        
        if (!weeklyTransactions[weekKey]) {
          weeklyTransactions[weekKey] = [];
        }
        weeklyTransactions[weekKey].push(transaction);
      });

      setTransactionsByWeek(weeklyTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
  try {
    setError(null);
    setSummary("Generating insights..."); // Loading state

    // Validate transactions
    if (transactions.length === 0) {
      throw new Error("No transactions available for the selected period");
    }

    // Get session
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.access_token) {
      throw new Error("Please sign in to generate summaries");
    }

    // Prepare request
    const requestData = {
      transactions: transactions.map(t => ({
        amount: t.amount,
        category: t.category_name,
        date: t.date,
        description: t.description.substring(0, 100) // Truncate long descriptions
      })),
      month: new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' }),
      year: selectedYear
    };

    // Make API request
    const response = await fetch('http://localhost:5000/api/generate-insights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(requestData)
    });

    // Handle response
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Analysis failed");
    }

    if (!data.insights) {
      throw new Error("Received empty analysis");
    }

    setSummary(data.insights);
    
  } catch (error) {
    console.error("Summary generation failed:", error);
    setError(error.message);
    setSummary(""); // Clear loading state
  }
};

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
      
      // Title
      doc.setFontSize(20);
      doc.text(`Expense Report - ${monthName} ${selectedYear}`, 105, 15, { align: 'center' });
      
      let startY = 25;
      
      // Summary
      if (summary) {
        doc.setFontSize(12);
        doc.text('AI-Generated Summary:', 14, startY);
        doc.setFontSize(10);
        const splitSummary = doc.splitTextToSize(summary, 180);
        doc.text(splitSummary, 14, startY + 5);
        startY = doc.lastAutoTable?.finalY || startY + 5 + splitSummary.length * 5;
      }
      
      // Transactions by week
      Object.entries(transactionsByWeek).forEach(([week, weekTransactions]) => {
        doc.setFontSize(12);
        doc.text(`${week}:`, 14, startY + 10);
        
        autoTable(doc, {
          startY: startY + 15,
          head: [['Date', 'Category', 'Description', 'Amount']],
          body: weekTransactions.map(t => [
            new Date(t.date).toLocaleDateString(),
            t.category_name,
            t.description || '-',
            `$${t.amount.toFixed(2)}`
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [44, 62, 80] }
        });
        
        // Weekly total
        const weekTotal = weekTransactions.reduce((sum, t) => sum + t.amount, 0);
        doc.setFontSize(10);
        doc.text(`Weekly Total: $${weekTotal.toFixed(2)}`, 14, doc.lastAutoTable.finalY + 5);
        
        startY = doc.lastAutoTable.finalY + 10;
      });
      
      // Monthly total
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      doc.setFontSize(12);
      doc.text(`Monthly Total: $${total.toFixed(2)}`, 14, startY + 10);
      
      // Save the PDF
      doc.save(`expense-report-${selectedMonth}-${selectedYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF');
    }
  };

  const handleMonthChange = (e) => {
    setSelectedMonth(parseInt(e.target.value));
  };

  const handleYearChange = (e) => {
    setSelectedYear(parseInt(e.target.value));
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="reports-container">
      <h1>Expense Reports</h1>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="report-controls">
        <div className="date-selectors">
          <select value={selectedMonth} onChange={handleMonthChange}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          
          <select value={selectedYear} onChange={handleYearChange}>
            {Array.from({ length: 5 }, (_, i) => {
              const year = new Date().getFullYear() - i;
              return <option key={year} value={year}>{year}</option>;
            })}
          </select>
        </div>
        
        <button onClick={generateSummary} className="generate-btn">
          Generate AI Summary
        </button>
      </div>
      
      {summary && (
        <div className="summary-section">
          <h2>AI Summary for {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
          <p>{summary}</p>
        </div>
      )}
      
      <div className="weekly-transactions">
        {Object.entries(transactionsByWeek).map(([week, weekTransactions]) => (
          <div key={week} className="week-section">
            <h3>{week}</h3>
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {weekTransactions.map(tx => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>{tx.category_name}</td>
                    <td>{tx.description || '-'}</td>
                    <td>${tx.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="week-total">
                  <td colSpan="3">Weekly Total:</td>
                  <td>${weekTransactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      
      <div className="report-actions">
        {transactions.length > 0 ? (
          <button onClick={generatePDF} className="download-btn">
            Download PDF Report
          </button>
        ) : (
          <p>No transactions found for selected period.</p>
        )}
      </div>
    </div>
  );
}

export default Reports;