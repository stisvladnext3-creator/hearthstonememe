import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreCustomCards } from './game/custom-cards';
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
import './card-editor.css';
import './hero-classes.css';
import './hero-effects.css';
import './decks.css';
import './storm.css';
import './collection-album.css';

restoreCustomCards();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ArtworkProvider><CardAppearanceProvider><App /></CardAppearanceProvider></ArtworkProvider></React.StrictMode>,
);
