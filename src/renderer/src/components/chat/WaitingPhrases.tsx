export function WaitingPhrases() {
  return <div className="waiting-phrases" role="status" aria-label="Novi is thinking">
    <div className="waiting-label"><span className="activity" aria-hidden="true"><span /><span /><span /></span><span>You can say</span></div>
    <p>“Let me take a moment to think that through.”</p>
    <p>“Let me work through this step by step.”</p>
  </div>;
}
