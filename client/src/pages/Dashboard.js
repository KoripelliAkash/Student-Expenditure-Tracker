import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, 
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import '../styles/Dashboard.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [categoryData, setCategoryData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [insights, setInsights] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          date,
          description,
          category_id,
          categories!inner(
            name
          )
        `)
        .order('date', { ascending: false });

      if (error) throw error;

      // Format data to include category_name
      const formattedData = data.map(transaction => ({
        ...transaction,
        category_name: transaction.categories.name
      }));

      setTransactions(formattedData);
      processData(formattedData);
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const processData = (transactions) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Filter current month's transactions
    const monthlyTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    
    // Calculate monthly total
    const total = monthlyTransactions.reduce((sum, t) => sum + t.amount, 0);
    setMonthlyTotal(total);

    // Prepare category data for pie chart
    const categoryMap = {};
    monthlyTransactions.forEach(t => {
      const category = t.category_name;
      categoryMap[category] = (categoryMap[category] || 0) + t.amount;
    });

    const categoryChartData = Object.keys(categoryMap).map(category => ({
      name: category,
      value: categoryMap[category]
    }));
    setCategoryData(categoryChartData);

    // Prepare weekly data for line chart (maximum 5 weeks)
    const weeklyMap = {};
    const weeksInMonth = getWeeksInMonth(currentYear, currentMonth);
    
    // Initialize weekly data with 5 weeks max
    for (let i = 1; i <= 5; i++) {
      weeklyMap[`Week ${i}`] = 0;
    }

    // Assign transactions to weeks
    monthlyTransactions.forEach(t => {
      const date = new Date(t.date);
      const weekNum = getWeekOfMonth(date);
      // Cap at week 5 if needed
      const adjustedWeekNum = Math.min(weekNum, 5);
      const weekKey = `Week ${adjustedWeekNum}`;
      weeklyMap[weekKey] = (weeklyMap[weekKey] || 0) + t.amount;
    });

    const weeklyChartData = Object.keys(weeklyMap).map(week => ({
      name: week,
      amount: weeklyMap[week]
    }));
    setWeeklyData(weeklyChartData);

    // Prepare monthly data for bar chart (last 6 months)
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      monthlyMap[key] = 0;
    }

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthDiff = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
      if (monthDiff >= 0 && monthDiff < 6) {
        const key = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
        monthlyMap[key] = (monthlyMap[key] || 0) + t.amount;
      }
    });

    const monthlyChartData = Object.keys(monthlyMap).map(month => ({
      name: month,
      total: monthlyMap[month]
    }));
    setMonthlyData(monthlyChartData);
  };

  // Improved week of month calculation
  const getWeekOfMonth = (date) => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfMonth = date.getDate();
    
    // Adjust for the first week starting on the 1st regardless of day
    return Math.ceil((dayOfMonth + firstDayOfMonth.getDay()) / 7);
  };

  // Simplified weeks in month calculation
  const getWeeksInMonth = (year, month) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Math.ceil((daysInMonth + firstDay) / 7);
  };

  const generateInsights = async () => {
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
            category: t.category_name,
            date: t.date,
            description: t.description
          }))
        })
      });

      const data = await response.json();
      setInsights(data.insights);
    } catch (error) {
      console.error('Error generating insights:', error);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard-container">
      <h1>Expense Dashboard</h1>
      
      <div className="summary-card">
        <h2>Monthly Summary</h2>
        <p className="total-amount">Total Spent: ${monthlyTotal.toFixed(2)}</p>
      </div>

      <div className="charts-row">
        {/* Pie Chart */}
        <div className="chart-container">
          <h3>Expense by Category</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p>No category data available</p>
          )}
        </div>

        {/* Weekly Line Chart */}
        <div className="chart-container">
          <h3>Weekly Expenses (Current Month)</h3>
          {weeklyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#8884d8" 
                  activeDot={{ r: 8 }} 
                  name="Amount Spent"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p>No weekly data available</p>
          )}
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="chart-container full-width">
        <h3>Monthly Comparison (Last 6 Months)</h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#8884d8" name="Total Expenses" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p>No monthly data available</p>
        )}
      </div>

      <div className="insights-section">
        <h2>AI Insights</h2>
        <button onClick={generateInsights} className="generate-btn">
          Generate Monthly Insights
        </button>
        {insights && (
          <div className="insights-content">
            <p>{insights}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;