"use client";

import { Component, createRef, type ReactNode } from "react";
import { RequestErrorNotice } from "@/app/quick-brief-error";

type Props = {
  children: ReactNode;
  fallbackMessage: string;
};

type State = {
  failed: boolean;
};

/**
 * Last line of defense for result rendering. Every 2xx body is fully parsed
 * before it reaches a result component, so this should never trip; if it
 * does, the user sees the same non-retryable notice as for a malformed
 * response and focus moves to it, matching the other error paths. The owner
 * keys the boundary by result epoch, so a new result creates a fresh boundary
 * even when the same sample object is shown again. The caught error is
 * deliberately neither rendered nor logged here: it could contain rendered
 * input.
 */
export class ResultErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  private readonly fallbackRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidMount() {
    if (this.state.failed) this.fallbackRef.current?.focus();
  }

  componentDidUpdate(_previous: Props, previousState: State) {
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
