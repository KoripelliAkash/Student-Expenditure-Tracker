import React from 'react';
import { useNavigate } from 'react-router-dom';
import bg from "../assets/bg.png";
import aiImage from "../assets/ai.jpeg";
import '../styles/Features.css';

const Features = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: "Expense Tracking",
      description: "Track your daily expenses with ease. Categorize and monitor your spending patterns.",
      icon: "💰"
    },
    {
      title: "Budget Management",
      description: "Set budgets for different categories and get insights on your spending habits.",
      icon: "📊"
    },
    {
      title: "Detailed Reports",
      description: "Generate comprehensive reports to analyze your financial journey over time.",
      icon: "📈"
    },
    {
      title: "Transaction History",
      description: "View and manage your complete transaction history with powerful filtering options.",
      icon: "📝"
    }
  ];

  const handleFeatureClick = () => {
    navigate('/login');
  };

  return (
    <div className="features-overlay">
        <div className="image-container">
        <img
          src={bg}
          alt="Background"
          className="background-image"
        />
        <div className="overlay">
          <h1 className="title">Welcome to Student Tracker</h1>
          <p className="subtitle">Your personal finance management companion</p>
          <button className="get-started-btn" onClick={() => navigate('/login')}>Get Started</button>
        </div>
      </div>
        
    <div className="features-container">
      <div className="features-header">
        <h1>Explore the our core features</h1>
      </div>
      
      <div className="features-grid">
        {features.map((feature, index) => (
          <div 
            key={index} 
            className="feature-card" 
            onClick={handleFeatureClick}
          >
            <div className="feature-icon">{feature.icon}</div>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
      </div>

      <div className="feature">
      <div className="feature-left">
        <img src={aiImage} alt="AI Insights" className="feature-img" />
      </div>
      <div className="feature-right">
        <h2 className="feature-title">AI-Powered Monthly Insights</h2>
        <p className="feature-text">
          Get personalized monthly insights powered by AI. Track trends, 
          understand your progress, and receive smart recommendations to 
          improve your performance effortlessly.
        </p>
        <button className="feature-btn" onClick={handleFeatureClick}>Learn More</button>
      </div>
    </div>

    </div>
  );
};

export default Features;