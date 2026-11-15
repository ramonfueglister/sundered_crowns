import { render } from 'preact';
import '@fontsource/crimson-pro/latin-500.css';
import '@fontsource/crimson-pro/latin-600.css';
import '@fontsource/crimson-pro/latin-700.css';
import '@fontsource/crimson-pro/latin-ext-500.css';
import '@fontsource/crimson-pro/latin-ext-600.css';
import '@fontsource/crimson-pro/latin-ext-700.css';
import { App } from './ui/App';
import './ui/style.css';

render(<App />, document.getElementById('app')!);
