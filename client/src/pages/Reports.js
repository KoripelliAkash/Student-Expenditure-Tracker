import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/Reports.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from "react-router-dom";

const tableStyles = `
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid black;
      padding: 8px;
      text-align: left;
    }
  `;


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
      setSummary("Generating insights with Gemma AI...");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in");

      // Prepare optimized payload
      const payload = {
        transactions: transactions.map(t => ({
          amount: t.amount,
          category: t.category_name,
          date: t.date,
          description: t.description?.substring(0, 50) || ''
        })),
        month: new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' }),
        year: selectedYear
      };

      const response = await fetch('http://localhost:5000/api/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.fallback || "Analysis failed");
      }

      setSummary(data.insights || data.fallback);

    } catch (error) {
      setError(error.message);
      setSummary("");
      console.error("Analysis Error:", error);
    }
  };

  const generatePDF = () => {
    try {
      let elementContents = document.getElementById("pdf-dl").innerHTML;
      let printWindow = window.open('', '', 'height=800,width=1000');
      // printWindow.document.write(`<html><head><style> body { font-family: Arial, sans-serif; } </style></head> <body> ${elementContents} </body></html>`); // .write Deprecated
      let htmlContent = (`<html><head><style> body { font-family: Arial, sans-serif; } </style></head> <body> ${elementContents} </body></html>`);
      printWindow.document.body.innerHTML = htmlContent;
      printWindow.document.close();
      printWindow.print();
      printWindow.close();


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
      <div id='pdf-dl'>
        {summary && (
          <div className="summary-section">
            <h2>AI Summary for {new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
            <div>
              <style>{tableStyles}</style>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                children={summary}
                components={{
                  table: ({ node, ...props }) => (
                    <table style={{ border: '1px solid black' }} {...props} />
                  )
                }}
              />
            </div>
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