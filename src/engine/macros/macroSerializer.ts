import type {
  MacroActionType,
  MacroScript,
  MacroStep,
  ParameterDefinition,
  ParameterType,
} from "./types";

const VALID_ACTION_TYPES: ReadonlySet<string> = new Set([
  "create_node",
  "delete_node",
  "move_node",
  "update_node",
  "create_edge",
  "delete_edge",
  "update_edge",
  "select_node",
  "select_step",
  "trigger_layout",
  "set_viewport",
  "collapse_node",
  "custom_action",
  "delay",
  "batch_action",
]);

const VALID_PARAM_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "json",
  "select",
  "nodeId",
  "edgeId",
]);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedScript?: MacroScript;
}

export class MacroSerializer {
  /**
   * Serializes a MacroScript to formatted or compact JSON string.
   */
  public static serialize(script: MacroScript, pretty: boolean = true): string {
    const sanitized = this.sanitizeScript(script);
    return JSON.stringify(sanitized, null, pretty ? 2 : undefined);
  }

  /**
   * Serializes an array of MacroScripts to JSON string.
   */
  public static serializeLibrary(scripts: MacroScript[], pretty: boolean = true): string {
    const sanitized = scripts.map((s) => this.sanitizeScript(s));
    return JSON.stringify(
      {
        schemaVersion: "1.0.0",
        exportedAt: new Date().toISOString(),
        count: sanitized.length,
        macros: sanitized,
      },
      null,
      pretty ? 2 : undefined,
    );
  }

  /**
   * Validates and deserializes a JSON string into a MacroScript.
   */
  public static deserialize(jsonString: string): {
    success: boolean;
    script?: MacroScript;
    errors: string[];
  } {
    if (!jsonString || typeof jsonString !== "string") {
      return { success: false, errors: ["Input must be a non-empty string."] };
    }

    try {
      const parsed = JSON.parse(jsonString) as unknown;
      const validation = this.validateScript(parsed);
      if (!validation.valid || !validation.sanitizedScript) {
        return { success: false, errors: validation.errors };
      }
      return { success: true, script: validation.sanitizedScript, errors: [] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, errors: [`JSON Parse Error: ${msg}`] };
    }
  }

  /**
   * Deserializes a library package containing multiple macros.
   */
  public static deserializeLibrary(jsonString: string): {
    success: boolean;
    scripts: MacroScript[];
    errors: string[];
  } {
    if (!jsonString || typeof jsonString !== "string") {
      return { success: false, scripts: [], errors: ["Input must be a non-empty string."] };
    }

    try {
      const parsed = JSON.parse(jsonString) as unknown;
      const scripts: MacroScript[] = [];
      const errors: string[] = [];

      let rawList: unknown[] = [];
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (
        parsed &&
        typeof parsed === "object" &&
        "macros" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).macros)
      ) {
        rawList = (parsed as { macros: unknown[] }).macros;
      } else if (parsed && typeof parsed === "object") {
        // Maybe single script
        const singleVal = this.validateScript(parsed);
        if (singleVal.valid && singleVal.sanitizedScript) {
          return { success: true, scripts: [singleVal.sanitizedScript], errors: [] };
        }
        return { success: false, scripts: [], errors: ["Invalid library format."] };
      }

      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        const val = this.validateScript(item);
        if (val.valid && val.sanitizedScript) {
          scripts.push(val.sanitizedScript);
        } else {
          errors.push(`Item #${i + 1} validation failed: ${val.errors.join(", ")}`);
        }
      }

      return {
        success: scripts.length > 0,
        scripts,
        errors,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, scripts: [], errors: [`JSON Parse Error: ${msg}`] };
    }
  }

  /**
   * Validates an unknown object against MacroScript schema.
   */
  public static validateScript(input: unknown): ValidationResult {
    const errors: string[] = [];

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { valid: false, errors: ["Script must be a JSON object."] };
    }

    const obj = input as Record<string, unknown>;

    // Check name
    const name =
      typeof obj.name === "string" && obj.name.trim().length > 0
        ? obj.name.trim()
        : "Unnamed Macro";
    const id =
      typeof obj.id === "string" && obj.id.trim().length > 0
        ? obj.id.trim()
        : `macro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const version = typeof obj.version === "string" ? obj.version : "1.0.0";
    const description = typeof obj.description === "string" ? obj.description : "";
    const category = typeof obj.category === "string" ? obj.category : "General";
    const tags = Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string")
      : [];
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString();
    const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString();

    // Validate parameters
    const parameters: ParameterDefinition[] = [];
    if (Array.isArray(obj.parameters)) {
      for (let i = 0; i < obj.parameters.length; i++) {
        const p = obj.parameters[i];
        if (p && typeof p === "object") {
          const pObj = p as Record<string, unknown>;
          const pName = typeof pObj.name === "string" ? pObj.name.trim() : `param_${i + 1}`;
          const pType: ParameterType =
            typeof pObj.type === "string" && VALID_PARAM_TYPES.has(pObj.type)
              ? (pObj.type as ParameterType)
              : "string";

          parameters.push({
            name: pName,
            label: typeof pObj.label === "string" ? pObj.label : pName,
            description: typeof pObj.description === "string" ? pObj.description : undefined,
            type: pType,
            defaultValue: pObj.defaultValue !== undefined ? pObj.defaultValue : "",
            required: Boolean(pObj.required),
            options: Array.isArray(pObj.options)
              ? pObj.options
                  .filter(
                    (opt): opt is Record<string, unknown> =>
                      typeof opt === "object" && opt !== null,
                  )
                  .map((opt) => ({
                    label: String(opt.label ?? opt.value ?? ""),
                    value: opt.value,
                  }))
              : undefined,
          });
        }
      }
    }

    // Validate steps
    const steps: MacroStep[] = [];
    if (!Array.isArray(obj.steps)) {
      errors.push("Field 'steps' must be an array.");
    } else {
      for (let i = 0; i < obj.steps.length; i++) {
        const stepItem = obj.steps[i];
        if (!stepItem || typeof stepItem !== "object") {
          errors.push(`Step #${i + 1} must be an object.`);
          continue;
        }

        const sObj = stepItem as Record<string, unknown>;
        const stepId = typeof sObj.id === "string" ? sObj.id : `step_${i + 1}_${Date.now()}`;
        const rawType = typeof sObj.type === "string" ? sObj.type : "custom_action";

        if (!VALID_ACTION_TYPES.has(rawType)) {
          errors.push(`Step #${i + 1} has unrecognized action type "${rawType}".`);
        }

        const stepType: MacroActionType = VALID_ACTION_TYPES.has(rawType)
          ? (rawType as MacroActionType)
          : "custom_action";

        const label =
          typeof sObj.label === "string" && sObj.label.trim().length > 0
            ? sObj.label.trim()
            : `Step ${i + 1}: ${stepType}`;

        const payload =
          sObj.payload && typeof sObj.payload === "object" && !Array.isArray(sObj.payload)
            ? (sObj.payload as Record<string, unknown>)
            : {};

        steps.push({
          id: stepId,
          type: stepType,
          label,
          description: typeof sObj.description === "string" ? sObj.description : undefined,
          payload,
          enabled: sObj.enabled !== false,
          delayBeforeMs:
            typeof sObj.delayBeforeMs === "number" ? Math.max(0, sObj.delayBeforeMs) : undefined,
          delayAfterMs:
            typeof sObj.delayAfterMs === "number" ? Math.max(0, sObj.delayAfterMs) : undefined,
          breakpoint: Boolean(sObj.breakpoint),
          continueOnError: Boolean(sObj.continueOnError),
        });
      }
    }

    if (steps.length === 0 && Array.isArray(obj.steps) && obj.steps.length === 0) {
      // Empty steps allowed for blank template
    }

    const sanitizedScript: MacroScript = {
      id,
      name,
      description,
      version,
      category,
      tags,
      parameters,
      steps,
      createdAt,
      updatedAt,
    };

    return {
      valid: errors.length === 0,
      errors,
      sanitizedScript,
    };
  }

  private static sanitizeScript(script: MacroScript): MacroScript {
    return {
      id: script.id,
      name: script.name,
      description: script.description ?? "",
      version: script.version ?? "1.0.0",
      author: script.author,
      tags: script.tags ?? [],
      category: script.category ?? "General",
      parameters: script.parameters.map((p) => ({
        name: p.name,
        label: p.label,
        description: p.description,
        type: p.type,
        defaultValue: p.defaultValue,
        required: p.required,
        options: p.options,
        validation: p.validation,
      })),
      steps: script.steps.map((s) => ({
        id: s.id,
        type: s.type,
        label: s.label,
        description: s.description,
        payload: { ...s.payload },
        enabled: s.enabled,
        delayBeforeMs: s.delayBeforeMs,
        delayAfterMs: s.delayAfterMs,
        timeoutMs: s.timeoutMs,
        retryCount: s.retryCount,
        continueOnError: s.continueOnError,
        breakpoint: s.breakpoint,
        timestamp: s.timestamp,
      })),
      triggers: script.triggers,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
    };
  }
}
