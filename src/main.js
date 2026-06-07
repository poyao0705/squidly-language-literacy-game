import './style.css';
import { LanguageLiteracyGame } from './app';

const rootElement = document.querySelector('#app');
const game = new LanguageLiteracyGame(rootElement);

game.init();
