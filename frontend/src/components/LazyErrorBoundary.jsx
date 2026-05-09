import React from 'react';

export default class LazyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unable to load this module.'
    };
  }

  componentDidCatch(error, info) {
    console.error('Lazy module failed to load:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="lazy-error-boundary">
        <strong>{this.props.title || '模組載入失敗'}</strong>
        <p>此區塊暫時無法載入，可能是網路中斷或瀏覽器仍保留舊版資源。請重新整理頁面後再試一次。</p>
        <small>{this.state.message}</small>
        <button onClick={() => window.location.reload()}>重新整理</button>
      </div>
    );
  }
}
