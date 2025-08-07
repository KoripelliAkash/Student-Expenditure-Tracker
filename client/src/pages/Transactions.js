import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Tesseract from 'tesseract.js';
import '../styles/Transactions.css';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [currentBudget, setCurrentBudget] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [remainingBudget, setRemainingBudget] = useState(0);
  const [formData, setFormData] = useState({
    amount: '',
    category_id: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    receipt: null
  });
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTransactions();
    fetchCategories();
    fetchCurrentBudget();
  }, []);

  useEffect(() => {
    calculateMonthlySpending();
  }, [transactions, currentBudget]);

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
          receipt_url,
          category_id,
          categories!inner(
            name
          )
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;
      
      // Format the data to include category_name
      const formattedData = data.map(transaction => ({
        ...transaction,
        category_name: transaction.categories.name
      }));
      
      setTransactions(formattedData);
      setError(null);
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*');
      
      if (error) throw error;
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      setError(error.message);
    }
  };

  const fetchCurrentBudget = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const now = new Date();
      const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
      const currentYear = now.getFullYear();

      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', currentMonth)
        .eq('year', currentYear)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        throw error;
      }

      setCurrentBudget(data);
    } catch (error) {
      console.error('Error fetching budget:', error.message);
    }
  };

  const calculateMonthlySpending = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === currentMonth && 
             transactionDate.getFullYear() === currentYear;
    });

    const totalSpent = monthlyTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    setMonthlySpent(totalSpent);

    if (currentBudget) {
      const remaining = parseFloat(currentBudget.amount) - totalSpent;
      setRemainingBudget(remaining);
    } else {
      setRemainingBudget(0);
    }
  };

  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    if (!budgetInput || isNaN(budgetInput) || parseFloat(budgetInput) <= 0) {
      setError('Please enter a valid budget amount');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const { data, error } = await supabase
        .from('budgets')
        .upsert({
          user_id: user.id,
          amount: parseFloat(budgetInput),
          month: currentMonth,
          year: currentYear
        }, {
          onConflict: 'user_id,month,year'
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentBudget(data);
      setBudgetInput('');
      setShowBudgetForm(false);
      setError(null);
    } catch (error) {
      console.error('Error setting budget:', error.message);
      setError(error.message);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({
      ...prev,
      receipt: e.target.files[0]
    }));
  };

  const runOcr = async (file) => {
    setOcrProgress(0);
    setOcrText('');
    setError(null);
    
    try {
      const result = await Tesseract.recognize(
        file,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100));
            }
          }
        }
      );
      
      setOcrText(result.data.text);
      
      // Try to extract amount (simple pattern matching)
      const amountMatch = result.data.text.match(/(\d+\.\d{2})/);
      if (amountMatch) {
        setFormData(prev => ({
          ...prev,
          amount: amountMatch[1]
        }));
      }
    } catch (error) {
      console.error('OCR error:', error);
      setError('Failed to process receipt image');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    // Validation
    if (!formData.amount || isNaN(formData.amount)) {
      setError('Please enter a valid amount');
      return;
    }
    if (!formData.category_id) {
      setError('Please select a category');
      return;
    }

    setIsUploading(true);
    
    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // 2. Handle receipt upload if exists
      let receiptUrl = null;
      if (formData.receipt) {
        try {
          const fileExt = formData.receipt.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          
          // First, make sure the receipts bucket exists
          const { data: buckets } = await supabase.storage.listBuckets();
          const receiptsBucket = buckets.find(bucket => bucket.name === 'receipts');
          
          if (!receiptsBucket) {
            // Create the bucket if it doesn't exist
            const { error: bucketError } = await supabase.storage.createBucket('receipts', {
              public: true,
              allowedMimeTypes: ['image/*'],
              fileSizeLimit: 1024 * 1024 * 10 // 10MB
            });
            if (bucketError) throw bucketError;
          }

          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, formData.receipt, {
              cacheControl: '3600',
              upsert: false
            });
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);
          
          receiptUrl = publicUrl;
        } catch (uploadError) {
          console.error('Receipt upload failed:', uploadError);
          setError(`Receipt upload failed: ${uploadError.message}. Transaction will be saved without receipt.`);
          // Continue without receipt if upload fails
        }
      }

      // 3. Insert transaction
      const { data, error: insertError } = await supabase
        .from('transactions')
        .insert({
          amount: parseFloat(formData.amount),
          category_id: parseInt(formData.category_id),
          description: formData.description,
          date: formData.date,
          receipt_url: receiptUrl,
          user_id: user.id
        })
        .select();

      if (insertError) throw insertError;
      
      console.log('Transaction added:', data);

      // 4. Reset form and refresh data
      setFormData({
        amount: '',
        category_id: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        receipt: null
      });
      setOcrText('');
      
      // Force refresh of all data
      await Promise.all([
        fetchTransactions(),
        fetchCurrentBudget()
      ]);

      // Clear file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }

    } catch (error) {
      console.error('Transaction error:', error);
      setError(error.message || 'Failed to add transaction');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Refresh all data after deletion
      await Promise.all([
        fetchTransactions(),
        fetchCurrentBudget()
      ]);
    } catch (error) {
      console.error('Error deleting transaction:', error.message);
      setError(error.message);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="transactions-container">
      <h1>Manage Transactions</h1>
      
      {error && <div className="error-message">{error}</div>}
      
      {/* Budget Section */}
      <div className="budget-section">
        <h2>Monthly Budget</h2>
        {currentBudget ? (
          <div className="budget-info">
            <div className="budget-stats">
              <div className="stat-item">
                <span className="stat-label">Budget:</span>
                <span className="stat-value">${parseFloat(currentBudget.amount).toFixed(2)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Spent:</span>
                <span className="stat-value">${monthlySpent.toFixed(2)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Remaining:</span>
                <span className={`stat-value ${remainingBudget < 0 ? 'over-budget' : 'under-budget'}`}>
                  ${remainingBudget.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="budget-progress">
              <div className="progress-bar">
                <div 
                  className={`progress-fill ${monthlySpent > parseFloat(currentBudget.amount) ? 'over-budget' : ''}`}
                  style={{ width: `${Math.min((monthlySpent / parseFloat(currentBudget.amount)) * 100, 100)}%` }}
                ></div>
              </div>
              <span className="progress-text">
                {((monthlySpent / parseFloat(currentBudget.amount)) * 100).toFixed(1)}% used
                {monthlySpent > parseFloat(currentBudget.amount) && 
                  ` (${(((monthlySpent / parseFloat(currentBudget.amount)) - 1) * 100).toFixed(1)}% over)`
                }
              </span>
            </div>
            <div className="budget-actions">
              <button onClick={() => setShowBudgetForm(true)} className="update-budget-btn">
                Update Budget
              </button>
              <button 
                onClick={() => {
                  fetchTransactions();
                  fetchCurrentBudget();
                }}
                className="refresh-budget-btn"
                style={{
                  background: 'linear-gradient(135deg, #3E3F29, #BCA88D)',
                  color: 'white',
                  border: 'none',
                  width: 'auto',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9em',
                  marginLeft: '10px'
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="no-budget">
            <p>No budget set for this month</p>
            <button onClick={() => setShowBudgetForm(true)} className="set-budget-btn">
              Set Budget
            </button>
          </div>
        )}
        
        {showBudgetForm && (
          <div className="budget-form">
            <form onSubmit={handleBudgetSubmit}>
              <div className="form-group">
                <label>Monthly Budget ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="Enter budget amount"
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="save-budget-btn">Save Budget</button>
                <button type="button" onClick={() => setShowBudgetForm(false)} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      
      <div className="transaction-form">
        <h2>Add New Transaction</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select
              name="category_id"
              value={formData.category_id}
              onChange={handleChange}
              required
            >
              <option value="">Select a category</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </div>
          
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Receipt (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            {formData.receipt && (
              <div className="ocr-section">
                <button 
                  type="button" 
                  onClick={() => runOcr(formData.receipt)}
                  className="ocr-btn"
                >
                  Extract Text from Receipt
                </button>
                {ocrProgress > 0 && ocrProgress < 100 && (
                  <div className="ocr-progress">
                    <progress value={ocrProgress} max="100" />
                    <span>{ocrProgress}%</span>
                  </div>
                )}
                {ocrText && (
                  <div className="ocr-result">
                    <h4>Extracted Text:</h4>
                    <p>{ocrText}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <button type="submit" disabled={isUploading} className="submit-btn">
            {isUploading ? 'Adding...' : 'Add Transaction'}
          </button>
        </form>
      </div>
      
      <div className="transactions-list">
        <h2>Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p>No transactions found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>{new Date(tx.date).toLocaleDateString()}</td>
                  <td>{tx.category_name}</td>
                  <td>{tx.description || '-'}</td>
                  <td>${tx.amount.toFixed(2)}</td>
                  <td>
                    {tx.receipt_url ? (
                      <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    ) : '-'}
                  </td>
                  <td>
                    <button 
                      onClick={() => deleteTransaction(tx.id)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Transactions;