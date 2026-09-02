"use client";

import { Component, type ReactNode } from "react";
import { RequestErrorNotice } from "@/app/quick-brief-error";

type Props = {
  children: ReactNode;
  /** When this value changes, a tripped boundary resets and renders the new children. */
  resetKey: unknown;
  fallbackMessage: string;
};

type State = {
  failed: boolean;
};

/**
 * Last line of defense for result rendering. Every 2xx body is fully parsed
 * before it reaches a result component, so this should never trip; if it
 * does, the user sees the same non-retryable notice as for a malformed
 * response. The caught error is deliberately not rendered or logged here: it
 * could contain rendered input.
 */
export class ResultErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <RequestErrorNotice
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
