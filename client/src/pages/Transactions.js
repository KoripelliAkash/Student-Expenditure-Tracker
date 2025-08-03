import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Tesseract from 'tesseract.js';
import '../styles/Transactions.css';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
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
          
          const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(fileName, formData.receipt);
          
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);
          
          receiptUrl = publicUrl;
        } catch (uploadError) {
          console.error('Receipt upload failed:', uploadError);
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

      // 4. Reset form and refresh
      setFormData({
        amount: '',
        category_id: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        receipt: null
      });
      setOcrText('');
      await fetchTransactions();

      

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
      fetchTransactions();
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