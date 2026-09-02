import type { Ref } from "react";
import type { ClientError } from "@/lib/api-client";

/**
 * Error region for a failed API request. The container is the live alert and
 * the programmatic focus target; the safe message stays primary, the retry
 * action appears only when the server marked the failure retryable, and the
 * code / request ID are rendered as a quiet support reference.
 */
export function RequestErrorNotice({
  error,
  onRetry,
  ref
}: {
  error: ClientError;
  onRetry?: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="error" role="alert" tabIndex={-1} ref={ref}>
      <p className="errorMessage">{error.message}</p>
      {error.retryable && onRetry ? (
        <div className="errorActions">
          <button className="secondaryButton" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
      <p className="errorReference">
        Error code {error.code}
        {error.requestId ? ` · Request ID ${error.requestId}` : null}
      </p>
    </div>
  );
}
