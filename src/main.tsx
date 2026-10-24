import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ArtworkProvider } from './artwork';
import { CardAppearanceProvider } from './card-appearance';
import './styles.css';
import './classic.css';
import './readability.css';
import './spell-cards.css';
import './discover.css';
import './battle-layout.css';
import './rooms.css';
import './card-layout.css';
import './phone.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ArtworkProvider><CardAppearanceProvider><App /></CardAppearanceProvider></ArtworkProvider></React.StrictMode>,
);
