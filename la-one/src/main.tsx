import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

type ErrorState = { hasError: boolean; message: string };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorState> {
  state: ErrorState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('L&A One render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#090914', color: '#f7f7ff', fontFamily: 'system-ui, sans-serif' }}>
          <section style={{ width: '100%', maxWidth: 360, padding: 24, border: '1px solid #49356b', borderRadius: 22, background: '#141529', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>L&amp;A One</div>
            <h1 style={{ fontSize: 19 }}>Не удалось открыть экран</h1>
            <p style={{ color: '#b6b5d0', fontSize: 13, lineHeight: 1.5 }}>Приложение столкнулось с ошибкой. Обнови страницу — если ошибка повторится, отправь нам её код.</p>
            <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', padding: 12, borderRadius: 10, background: '#090914', color: '#f0abfc', fontSize: 11, textAlign: 'left' }}>{this.state.message || 'Неизвестная ошибка'}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 10, padding: '12px 18px', border: 0, borderRadius: 12, color: 'white', fontWeight: 700, background: 'linear-gradient(100deg,#9333ea,#0891b2)' }}>Обновить приложение</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="padding:24px;color:white;background:#090914">Не найден корневой элемент приложения.</div>';
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
  rootElement.dataset.appMounted = 'true';
}
