import { Component } from "react";
import { RefreshCw } from "lucide-react";

export default class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Ember Offline kon dit scherm niet tonen.", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="eo-app-error" role="alert">
        <div className="eo-app-error__card">
          <h1>Ember Offline moet opnieuw worden geopend</h1>
          <p>Er ging iets mis bij het tonen van dit scherm. Je lokaal klaargezette formulieren blijven op dit apparaat bewaard.</p>
          <button type="button" className="eo-button eo-button--primary" onClick={() => window.location.reload()}>
            <RefreshCw size={18} />
            Opnieuw openen
          </button>
        </div>
      </main>
    );
  }
}
