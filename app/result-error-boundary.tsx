"use client";

import { Component, createRef, type ReactNode } from "react";
import { RequestErrorNotice } from "@/app/quick-brief-error";

type Props = {
  children: ReactNode;
  /** Incremented by the owner whenever a new result is set; a tripped boundary resets on change. */
  resetKey: number;
  fallbackMessage: string;
};

type State = {
  failed: boolean;
};

/**
 * Last line of defense for result rendering. Every 2xx body is fully parsed
 * before it reaches a result component, so this should never trip; if it
 * does, the user sees the same non-retryable notice as for a malformed
 * response and focus moves to it, matching the other error paths. The caught
 * error is deliberately neither rendered nor logged here: it could contain
 * rendered input. There is no automated test for this component by decision:
 * with full validation no legitimate input reaches a render failure, and no
 * test-only throwing path was added.
 */
export class ResultErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  private readonly fallbackRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: Props, previousState: State) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
      return;
    }
    if (this.state.failed && !previousState.failed) {
      this.fallbackRef.current?.focus();
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <RequestErrorNotice
          ref={this.fallbackRef}
          error={{
            message: this.props.fallbackMessage,
            code: "MALFORMED_RESPONSE",
            retryable: false
          }}
        />
      );
    }
    return this.props.children;
  }
}
