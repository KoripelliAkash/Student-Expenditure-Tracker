import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 12,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: 'bold',
    textDecoration: 'underline',
  },
  table: {
    width: '100%',
    marginBottom: 15,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 5,
  },
  tableHeader: {
    fontWeight: 'bold',
    backgroundColor: '#f2f2f2',
  },
  tableColDate: {
    width: '15%',
  },
  tableColCategory: {
    width: '20%',
  },
  tableColDesc: {
    width: '40%',
  },
  tableColAmount: {
    width: '15%',
    textAlign: 'right',
  },
  total: {
    textAlign: 'right',
    fontWeight: 'bold',
    marginTop: 10,
  },
});

const MyDocument = ({ transactions, month, year, summary }) => {
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  // Group by category for the pie chart 
  const categoryData = {};
  transactions.forEach(t => {
    const category = t.categories.category_name;
    categoryData[category] = (categoryData[category] || 0) + t.amount;
  });

  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Expense Report - {monthName} {year}</Text>
        </View>

        {summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI-Generated Summary</Text>
            <Text>{summary}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense Breakdown</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableColDate}>Date</Text>
              <Text style={styles.tableColCategory}>Category</Text>
              <Text style={styles.tableColDesc}>Description</Text>
              <Text style={styles.tableColAmount}>Amount</Text>
            </View>

            {transactions.map((t, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableColDate}>{new Date(t.date).toLocaleDateString()}</Text>
                <Text style={styles.tableColCategory}>{t.category_name}</Text>
                <Text style={styles.tableColDesc}>{t.description || '-'}</Text>
                <Text style={styles.tableColAmount}>${t.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.total}>Total Expenses: ${total.toFixed(2)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense by Category</Text>
          {Object.entries(categoryData).map(([category, amount]) => (
            <Text key={category}>
              {category}: ${amount.toFixed(2)} ({(amount / total * 100).toFixed(1)}%)
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
};

export default MyDocument;