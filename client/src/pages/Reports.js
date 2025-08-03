import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { PDFDownloadLink } from '@react-pdf/renderer';
import MyDocument from '../components/ReportPDF';
import '../styles/Reports.css';

function Reports() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, [selectedMonth, selectedYear]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString();
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString();
      
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          date,
          description,
          categories(name as category_name)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data);
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
        },
        body: JSON.stringify({
          transactions: transactions.map(t => ({
            amount: t.amount,
            category: t.categories.category_name,
            date: t.date,
            description: t.description
          }))
        })
      });

      const data = await response.json();
      setSummary(data.insights);
    } catch (error) {
      console.error('Error generating summary:', error);
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
      
      <div className="report-actions">
        {transactions.length > 0 ? (
          <PDFDownloadLink
            document={
              <MyDocument 
                transactions={transactions} 
                month={selectedMonth} 
                year={selectedYear} 
                summary={summary} 
              />
            }
            fileName={`expense-report-${selectedMonth}-${selectedYear}.pdf`}
          >
            {({ loading }) => (
              <button className="download-btn" disabled={loading}>
                {loading ? 'Preparing PDF...' : 'Download PDF Report'}
              </button>
            )}
          </PDFDownloadLink>
        ) : (
          <p>No transactions found for selected period.</p>
        )}
      </div>
    </div>
  );
}

export default Reports;