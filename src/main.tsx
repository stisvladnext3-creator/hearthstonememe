import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ArtworkProvider } from './artwork';
import './styles.css';
import './classic.css';
import './readability.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ArtworkProvider><App /></ArtworkProvider></React.StrictMode>,
);
