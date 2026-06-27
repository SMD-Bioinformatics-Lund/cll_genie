import { Box, Button, IconButton, MenuItem, Select, TextField, Typography } from "@mui/material";
import { Plus, Trash } from "lucide-react";

export type VisualCondition = {
  id: string;
  fact: string;
  op: string;
  value: any;
};

export const parseAstToVisual = (ast: any): VisualCondition[] => {
  if (!ast || Object.keys(ast).length === 0) return [];
  
  const parseNode = (node: any): VisualCondition[] => {
    if (node.all) {
      return node.all.flatMap(parseNode);
    }
    if (node.fact && node.op) {
      return [{
        id: Math.random().toString(36).substr(2, 9),
        fact: node.fact,
        op: node.op,
        value: node.value,
      }];
    }
    return [];
  };
  
  return parseNode(ast);
};

export const buildAstFromVisual = (conditions: VisualCondition[]) => {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) {
    const c = conditions[0];
    return { fact: c.fact, op: c.op, value: c.value };
  }
  return {
    all: conditions.map(c => ({
      fact: c.fact,
      op: c.op,
      value: c.value
    }))
  };
};

const CATEGORIES = [
  { value: "combined_mutation_status", label: "Mutation Status" },
  { value: "all_productive", label: "Productive Status" },
  { value: "sequence_count", label: "Sequence Count" },
  { value: "subset_ids", label: "Subset" },
  { value: "subset_conflict", label: "Subset Conflict" },
  { value: "any_stop_codon", label: "Any Stop Codon" },
  { value: "custom", label: "Custom Fact" },
];

export function RuleBuilder({
  conditions,
  onChange
}: {
  conditions: VisualCondition[];
  onChange: (c: VisualCondition[]) => void;
}) {
  const updateCondition = (id: string, updates: Partial<VisualCondition>) => {
    onChange(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCondition = (id: string) => {
    onChange(conditions.filter(c => c.id !== id));
  };

  const addCondition = () => {
    onChange([...conditions, {
      id: Math.random().toString(36).substr(2, 9),
      fact: "combined_mutation_status",
      op: "eq",
      value: "U-CLL"
    }]);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary">Rule Conditions (ALL must match)</Typography>
      
      {conditions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No conditions defined. This rule will always match.
        </Typography>
      )}

      {conditions.map((cond, index) => {
        const isCustom = !CATEGORIES.find(cat => cat.value === cond.fact) && cond.fact !== "custom";
        const selectedFact = isCustom ? "custom" : cond.fact;

        return (
          <Box key={cond.id} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', bgcolor: 'background.paper', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ flex: 1, display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Category"
                size="small"
                value={selectedFact}
                onChange={(e) => {
                  const newFact = e.target.value;
                  if (newFact === "all_productive" || newFact === "any_stop_codon" || newFact === "subset_conflict") {
                    updateCondition(cond.id, { fact: newFact, op: "eq", value: true });
                  } else if (newFact === "sequence_count") {
                    updateCondition(cond.id, { fact: newFact, op: "eq", value: 1 });
                  } else if (newFact === "subset_ids") {
                    updateCondition(cond.id, { fact: newFact, op: "contains", value: "#2" });
                  } else if (newFact === "combined_mutation_status") {
                    updateCondition(cond.id, { fact: newFact, op: "eq", value: "U-CLL" });
                  } else {
                    updateCondition(cond.id, { fact: newFact, op: "eq", value: "" });
                  }
                }}
                sx={{ minWidth: 200 }}
              >
                {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </TextField>

              {selectedFact === "custom" && (
                <TextField
                  label="Fact Name"
                  size="small"
                  value={cond.fact === "custom" ? "" : cond.fact}
                  onChange={(e) => updateCondition(cond.id, { fact: e.target.value })}
                />
              )}

              <TextField
                select
                label="Condition"
                size="small"
                value={cond.op}
                onChange={(e) => updateCondition(cond.id, { op: e.target.value })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="eq">Is</MenuItem>
                <MenuItem value="ne">Is Not</MenuItem>
                {selectedFact === "sequence_count" && [
                  <MenuItem key="gt" value="gt">Greater Than</MenuItem>,
                  <MenuItem key="gte" value="gte">Greater Than or Equal</MenuItem>,
                  <MenuItem key="lt" value="lt">Less Than</MenuItem>,
                  <MenuItem key="lte" value="lte">Less Than or Equal</MenuItem>
                ]}
                <MenuItem value="contains">Contains</MenuItem>
                <MenuItem value="in">In List</MenuItem>
                <MenuItem value="not_in">Not In List</MenuItem>
                <MenuItem value="is_null">Is Empty</MenuItem>
                <MenuItem value="is_not_null">Is Not Empty</MenuItem>
              </TextField>

              {(cond.op !== "is_null" && cond.op !== "is_not_null") && (
                <>
                  {(selectedFact === "combined_mutation_status") ? (
                    <TextField
                      select
                      label="Value"
                      size="small"
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                      sx={{ minWidth: 150 }}
                    >
                      <MenuItem value="U-CLL">U-CLL</MenuItem>
                      <MenuItem value="M-CLL">M-CLL</MenuItem>
                      <MenuItem value="Borderline">Borderline</MenuItem>
                      <MenuItem value="MIXED">MIXED</MenuItem>
                    </TextField>
                  ) : (selectedFact === "all_productive" || selectedFact === "any_stop_codon" || selectedFact === "subset_conflict") ? (
                    <TextField
                      select
                      label="Value"
                      size="small"
                      value={String(cond.value)}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value === "true" })}
                      sx={{ minWidth: 150 }}
                    >
                      <MenuItem value="true">Yes</MenuItem>
                      <MenuItem value="false">No</MenuItem>
                    </TextField>
                  ) : (selectedFact === "sequence_count") ? (
                    <TextField
                      type="number"
                      label="Value"
                      size="small"
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, { value: Number(e.target.value) })}
                      sx={{ width: 100 }}
                    />
                  ) : (
                    <TextField
                      label="Value"
                      size="small"
                      value={cond.value}
                      onChange={(e) => {
                         let val: any = e.target.value;
                         if (cond.op === "in" || cond.op === "not_in") {
                           val = val.split(",").map((s: string) => s.trim());
                         }
                         updateCondition(cond.id, { value: val });
                      }}
                      helperText={(cond.op === "in" || cond.op === "not_in") ? "Comma separated" : undefined}
                      fullWidth
                    />
                  )}
                </>
              )}
            </Box>
            
            <IconButton color="error" onClick={() => removeCondition(cond.id)}>
              <Trash size={18} />
            </IconButton>
          </Box>
        );
      })}

      <Box>
        <Button
          variant="outlined"
          startIcon={<Plus size={16} />}
          onClick={addCondition}
          size="small"
        >
          Add Condition
        </Button>
      </Box>
    </Box>
  );
}
