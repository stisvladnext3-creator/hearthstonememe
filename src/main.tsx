import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ArtworkProvider } from './artwork';
import './styles.css';
import './classic.css';
import './readability.css';
import './spell-cards.css';
import './discover.css';
import './battle-layout.css';
import './rooms.css';
import './card-layout.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ArtworkProvider><App /></ArtworkProvider></React.StrictMode>,
);
