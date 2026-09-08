export type RestorePolicyInput = {
  ownerAuthorized: boolean;
  action: string;
  status: string;
  alreadyRestored: boolean;
  resourceVersion: Date | null;
  resource: {
    exists: boolean;
    updatedAt?: Date;
    provenanceMatches: boolean;
    safeToDelete: boolean;
  };
};

export type RestorePolicyDecision = {
  eligible: boolean;
  conflictReason: string | null;
};

/**
 * Pure, default-deny restore policy shared by the Web/App service and tests.
 * A compensating deletion is allowed only when the resource is still exactly
 * the version created by the selected AI event and has no later attachments.
 */
export function evaluateAiCreateRestore(
  input: RestorePolicyInput,
): RestorePolicyDecision {
  let conflictReason: string | null = null;
  if (!input.ownerAuthorized) {
    conflictReason = "Only the resource owner can restore this AI action.";
  } else if (input.action !== "AI_CREATE_SUCCEEDED" || input.status !== "succeeded") {
    conflictReason = "Only a successful AI create action can be restored.";
  } else if (input.alreadyRestored) {
    conflictReason = "This AI action has already been restored.";
  } else if (!input.resourceVersion) {
    conflictReason = "The original resource version is unavailable.";
  } else if (!input.resource.exists) {
    conflictReason = "The created resource no longer exists.";
  } else if (!input.resource.provenanceMatches) {
    conflictReason = "The resource provenance no longer matches the AI action.";
  } else if (!input.resource.safeToDelete) {
    conflictReason = "The resource now contains data that was not created by MCP.";
  } else if (
    !input.resource.updatedAt ||
    input.resource.updatedAt.getTime() !== input.resourceVersion.getTime()
  ) {
    conflictReason = "The resource changed after the AI action.";
  }
  return { eligible: conflictReason === null, conflictReason };
}
