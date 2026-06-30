import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  LinearProgress,
  MenuItem,
  Paper,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "../components/ui";
import { Play, Send } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getJob, getSample, previewSequences, submitVquest } from "../api";
import { useSession } from "../session-context";

export function AnalysisPage() {
  const { sampleId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useSession();
  const [filters, setFilters] = useState({
    sheet_name: "Merged Read Summary",
    header_row: 4,
    minimum_reads_percent: 0,
    in_frame: "B",
    no_stop_codon: "B",
  });
  const [sequences, setSequences] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [analysisJobId, setAnalysisJobId] = useState<string>();
  const [uiStep, setUiStep] = useState<0 | 1 | 2>(0);

  const [options, setOptions] = useState({
    species: "human",
    receptorOrLocusType: "IGH",
    moleculeType: "gDNA",
    IMGTrefdirSet: 1,
    IMGTrefdirAlleles: true,
    V_REGIONsearchIndel: true,
    cllSubsetSearch: true,
    scfv: false,
    nbD_GENE: -1,
    nbVmut: -1,
    nbDmut: -1,
    nbJmut: -1,
    xv_summary: true,
    xv_IMGTgappedNt: true,
    xv_ntseq: true,
    xv_IMGTgappedAA: true,
    xv_AAseq: true,
    xv_JUNCTION: true,
    xv_parameters: true,
    xv_V_REGIONmuttable: true,
    xv_V_REGIONmutstatsNt: true,
    xv_V_REGIONmutstatsAA: true,
    xv_V_REGIONhotspots: true,
    xv_scFv: false,
  });
  const sample = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId),
  });



  const analysisJob = useQuery({
    queryKey: ["job", analysisJobId],
    queryFn: () => getJob(analysisJobId!),
    enabled: Boolean(analysisJobId),
    refetchInterval: (q) =>
      ["SUCCEEDED", "FAILED_FINAL"].includes(q.state.data?.status ?? "")
        ? false
        : 1500,
  });
  useEffect(() => {
    const result = analysisJob.data?.result;
    if (analysisJob.data?.status === "SUCCEEDED" && result?.submission_id)
      navigate(`/samples/${sampleId}/submissions/${result.submission_id}`);
  }, [analysisJob.data, navigate, sampleId]);
  
  const parse = useMutation({
    mutationFn: () => previewSequences(sampleId, filters, session.csrf_token),
    onSuccess: (data) => {
      const seqs = data.sequences as any[];
      if (!seqs || seqs.length === 0) {
        toast.error("No sequences passed the filters. Try adjusting the filter values.");
        return;
      }
      setSequences(seqs);
      setUiStep(1);
    },
    onError: (error: Error) => {
      toast.error(`Failed to read workbook: ${error.message}`);
    }
  });
  
  const submit = useMutation({
    mutationFn: () => {
      const selectedSequences = sequences.filter(s => selected.includes(s.sequence_id));
      return submitVquest(sampleId, selectedSequences, options, session.csrf_token);
    },
    onSuccess: (value) => {
      setAnalysisJobId(value.job_id);
      toast.success("Analysis started successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to start analysis: ${error.message}`);
    }
  });
  const activeStep = analysisJobId ? 2 : uiStep;
  
  // Create FASTA format for readonly text area
  const fastaPreview = sequences
    .filter(s => selected.includes(s.sequence_id))
    .map(s => `>${s.sequence_id}_${sample.data?.sample?.name ?? "Sample"}\n${s.sequence}`)
    .join("\n");

  return (
    <Container maxWidth="xl" className="py-8">
      <Typography variant="overline" color="primary" fontWeight={800}>
        New IMGT/V-QUEST analysis
      </Typography>
      <Typography variant="h3">
        {(sample.data?.sample as { name?: string })?.name ?? "Sample"}
      </Typography>
      <Stepper activeStep={activeStep} className="my-8">
        <Step>
          <StepLabel>Filter LymphoTrack</StepLabel>
        </Step>
        <Step>
          <StepLabel>Select sequences</StepLabel>
        </Step>
        <Step>
          <StepLabel>Run IMGT/V-QUEST</StepLabel>
        </Step>
      </Stepper>
      {uiStep === 0 && (
        <Paper className="form-panel" >
          <Typography variant="h5">Sequence filters</Typography>
          <div className="form-grid">
            <TextField
              label="Worksheet"
              value={filters.sheet_name}
              onChange={(e) =>
                setFilters({ ...filters, sheet_name: e.target.value })
              }
            />
            <TextField
              label="Header row"
              type="number"
              value={filters.header_row}
              onChange={(e) =>
                setFilters({ ...filters, header_row: Number(e.target.value) })
              }
            />
            <TextField
              label="Minimum reads %"
              type="number"
              value={filters.minimum_reads_percent}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  minimum_reads_percent: Number(e.target.value),
                })
              }
            />
            <TextField
              select
              label="In frame"
              value={filters.in_frame}
              onChange={(e) =>
                setFilters({ ...filters, in_frame: e.target.value })
              }
            >
              <MenuItem value="B">Both</MenuItem>
              <MenuItem value="Y">Yes</MenuItem>
              <MenuItem value="N">No</MenuItem>
            </TextField>
            <TextField
              select
              label="No stop codon"
              value={filters.no_stop_codon}
              onChange={(e) =>
                setFilters({ ...filters, no_stop_codon: e.target.value })
              }
            >
              <MenuItem value="B">Both</MenuItem>
              <MenuItem value="Y">Yes</MenuItem>
              <MenuItem value="N">No</MenuItem>
            </TextField>
          </div>
          <Button
            variant="contained"
            startIcon={parse.isPending ? undefined : <Play size={18} />}
            onClick={() => parse.mutate()}
            disabled={parse.isPending}
          >
            {parse.isPending ? "Reading workbook…" : "Read workbook"}
          </Button>
          {parse.isPending && (
            <div className="mt-6 rounded-xl border border-brand-primary/20 bg-brand-primary/5 dark:border-brand-detail/20 dark:bg-brand-detail/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-2 rounded-full bg-brand-primary dark:bg-brand-detail animate-pulse" />
                  <span className="text-sm font-medium text-brand-primary dark:text-brand-detail">
                    Parsing LymphoTrack workbook…
                  </span>
                </div>
              </div>
              <LinearProgress className="mt-1" />
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Reading sequences from <strong>{filters.sheet_name}</strong>, applying filters.
              </p>
            </div>
          )}
          {(parse.error) && (
            <Alert severity="error" className="mt-4">
              {(parse.error as Error)?.message}
            </Alert>
          )}
        </Paper>
      )}
      {uiStep === 1 && sequences.length > 0 && (
        <Paper className="data-panel" >
          <Box className="p-6 flex justify-between items-center">
            <Box>
              <Typography variant="h5">Select clonal sequences</Typography>
              <Typography color="text.secondary">
                {sequences.length} sequences passed the filters.
              </Typography>
            </Box>
            <Button
              variant="contained"
              disabled={!selected.length}
              onClick={() => setUiStep(2)}
            >
              Next: Configure V-QUEST
            </Button>
          </Box>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Sequence</th>
                  <th>Length</th>
                  <th>Total seq. read</th>
                  <th>Reads %</th>
                  <th>V-gene</th>
                  <th>J-gene</th>
                  <th>D-gene</th>
                  <th>V-mutation</th>
                  <th>Productivity</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map((seq) => (
                  <tr key={seq.sequence_id}>
                    <td>
                      <Checkbox
                        checked={selected.includes(seq.sequence_id)}
                        onChange={(_, checked) =>
                          setSelected(
                            checked
                              ? [...selected, seq.sequence_id]
                              : selected.filter((id) => id !== seq.sequence_id),
                          )
                        }
                      />
                    </td>
                    <td>{seq.sequence_id}</td>
                    <td>{seq.length ?? seq.sequence.length}</td>
                    <td>{seq.merge_count.toLocaleString()}</td>
                    <td>{seq.total_reads_percent.toFixed(2)}%</td>
                    <td>{seq.v_gene || "–"}</td>
                    <td>{seq.j_gene || "–"}</td>
                    <td>{seq.d_gene || "–"}</td>
                    <td>{seq.v_mutation !== undefined ? `${seq.v_mutation}%` : "–"}</td>
                    <td>
                      <Chip
                        size="small"
                        color={
                          seq.in_frame && seq.no_stop_codon
                            ? "success"
                            : "warning"
                        }
                        label={
                          seq.in_frame && seq.no_stop_codon
                            ? "Productive"
                            : "Review"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Box className="p-6 flex justify-start">
            <Button
              variant="outlined"
              onClick={() => setUiStep(0)}
            >
              Back to Filters
            </Button>
          </Box>
        </Paper>
      )}
      {uiStep === 2 && (
        <Paper className="data-panel overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-100 bg-linear-to-r from-brand-primary/5 to-transparent px-6 py-5 dark:border-neutral-700 dark:from-brand-detail/5">
            <Typography variant="h5" className="font-bold">IMGT/V-QUEST configuration</Typography>
            <Typography color="text.secondary" className="mt-1 text-sm">
              Configure parameters to submit <strong>{selected.length}</strong> sequence{selected.length !== 1 ? "s" : ""} to IMGT/V-QUEST.
            </Typography>
          </div>

          <div className="p-6 space-y-8">

            {/* ── Section 1: Core selection ── */}
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                Core selection
              </p>
              <div className="grid grid-cols-3 gap-4">
                <TextField
                  select
                  label="Molecule type"
                  value={options.moleculeType}
                  onChange={(e) => setOptions({ ...options, moleculeType: e.target.value })}
                >
                  <MenuItem value="Unknown">Unknown</MenuItem>
                  <MenuItem value="gDNA">gDNA</MenuItem>
                  <MenuItem value="cDNA">cDNA</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Receptor / locus"
                  value={options.receptorOrLocusType}
                  onChange={(e) => setOptions({ ...options, receptorOrLocusType: e.target.value })}
                >
                  <MenuItem value="IG">IG</MenuItem>
                  <MenuItem value="IGH">IGH</MenuItem>
                  <MenuItem value="IGK">IGK</MenuItem>
                  <MenuItem value="IGL">IGL</MenuItem>
                  <MenuItem value="TR">TR</MenuItem>
                  <MenuItem value="TRA">TRA</MenuItem>
                  <MenuItem value="TRB">TRB</MenuItem>
                  <MenuItem value="TRG">TRG</MenuItem>
                  <MenuItem value="TRD">TRD</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Species"
                  value={options.species}
                  onChange={(e) => setOptions({ ...options, species: e.target.value })}
                >
                  <MenuItem value="human">Homo sapiens (human)</MenuItem>
                  <MenuItem value="mouse">Mus musculus (house mouse)</MenuItem>
                  <MenuItem value="mas-night-monkey">Aotus nancymaae (Ma's night monkey)</MenuItem>
                  <MenuItem value="bovine">Bos taurus (bovine)</MenuItem>
                  <MenuItem value="camel">Camelus dromedarius (Arabian camel)</MenuItem>
                  <MenuItem value="dog">Canis lupus familiaris (dog)</MenuItem>
                  <MenuItem value="goat">Capra hircus (goat)</MenuItem>
                  <MenuItem value="chondrichthyes">Chondrichthyes</MenuItem>
                  <MenuItem value="zebrafish">Danio rerio (zebrafish)</MenuItem>
                  <MenuItem value="horse">Equus caballus (horse)</MenuItem>
                  <MenuItem value="cat">Felis catus (domestic cat)</MenuItem>
                  <MenuItem value="cod">Gadus morhua (Atlantic cod)</MenuItem>
                  <MenuItem value="chicken">Gallus gallus (chicken)</MenuItem>
                  <MenuItem value="gorilla">Gorilla gorilla gorilla</MenuItem>
                  <MenuItem value="naked-mole-rat">Heterocephalus glaber (naked mole-rat)</MenuItem>
                  <MenuItem value="catfish">Ictalurus punctatus (Channel catfish)</MenuItem>
                  <MenuItem value="lemur">Lemur catta (Ring-tailed lemur)</MenuItem>
                  <MenuItem value="crab-eating-macaque">Macaca fascicularis</MenuItem>
                  <MenuItem value="rhesus-monkey">Macaca mulatta (Rhesus monkey)</MenuItem>
                  <MenuItem value="ferret">Mustela putorius furo (ferret)</MenuItem>
                  <MenuItem value="nonhuman-primates">Nonhuman Primates</MenuItem>
                  <MenuItem value="platypus">Ornithorhynchus anatinus (platypus)</MenuItem>
                  <MenuItem value="rabbit">Oryctolagus cuniculus (rabbit)</MenuItem>
                  <MenuItem value="sheep">Ovis aries (sheep)</MenuItem>
                  <MenuItem value="pongo">Pongo abelii (Sumatran orangutan)</MenuItem>
                  <MenuItem value="rat">Rattus norvegicus (Norway rat)</MenuItem>
                  <MenuItem value="salmon">Salmo salar (Atlantic salmon)</MenuItem>
                  <MenuItem value="pig">Sus scrofa (pig)</MenuItem>
                  <MenuItem value="teleostei">Teleostei</MenuItem>
                  <MenuItem value="dolphin">Tursiops truncatus (Bottlenose dolphin)</MenuItem>
                  <MenuItem value="alpaca">Vicugna pacos (alpaca)</MenuItem>
                </TextField>
              </div>
            </section>

            {/* ── Section 2: FASTA preview ── */}
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                Nucleotide sequences (FASTA)
              </p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900/50">
                <TextField
                  multiline
                  fullWidth
                  rows={6}
                  value={fastaPreview}
                  InputProps={{ readOnly: true }}
                  className="font-mono text-xs"
                />
              </div>
            </section>

            <div className="h-px bg-gray-100 dark:bg-neutral-700" />

            {/* ── Section 3: Advanced parameters ── */}
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                Advanced parameters
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <TextField
                  select
                  label="Reference directory set"
                  value={options.IMGTrefdirSet}
                  onChange={(e) => setOptions({ ...options, IMGTrefdirSet: Number(e.target.value) })}
                >
                  <MenuItem value={0}>F+ORF</MenuItem>
                  <MenuItem value={1}>F+ORF+ in-frame P</MenuItem>
                  <MenuItem value={2}>F+ORF including orphons</MenuItem>
                  <MenuItem value={3}>F+ORF+ in-frame P including orphons</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Reference directory alleles"
                  value={String(options.IMGTrefdirAlleles)}
                  onChange={(e) => setOptions({ ...options, IMGTrefdirAlleles: e.target.value === "true" })}
                >
                  <MenuItem value="true">With all alleles</MenuItem>
                  <MenuItem value="false">Allele *01 only</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Search insertions/deletions"
                  value={String(options.V_REGIONsearchIndel)}
                  onChange={(e) => setOptions({ ...options, V_REGIONsearchIndel: e.target.value === "true" })}
                >
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Accepted D-GENE count"
                  value={options.nbD_GENE}
                  onChange={(e) => setOptions({ ...options, nbD_GENE: Number(e.target.value) })}
                >
                  <MenuItem value={-1}>Default</MenuItem>
                  {[0,1,2,3].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </TextField>
                {(["nbVmut", "nbDmut", "nbJmut"] as const).map((key) => (
                  <TextField
                    select
                    key={key}
                    label={`Max mutations — ${key.replace("nb","").replace("mut","-REGION")}`}
                    value={options[key]}
                    onChange={(e) => setOptions({ ...options, [key]: Number(e.target.value) })}
                  >
                    <MenuItem value={-1}>Default</MenuItem>
                    {[0,1,2,3,4,5,6,7,8,9,10].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </TextField>
                ))}
              </div>
            </section>

            {/* ── Section 4: Advanced functionalities ── */}
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                Advanced functionalities
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <TextField
                  select
                  label="scFv Analysis"
                  value={String(options.scfv)}
                  onChange={(e) => setOptions({ ...options, scfv: e.target.value === "true" })}
                >
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </TextField>
                <TextField
                  select
                  label="CLL subset #2/#8 search"
                  value={String(options.cllSubsetSearch)}
                  onChange={(e) => setOptions({ ...options, cllSubsetSearch: e.target.value === "true" })}
                >
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </TextField>
              </div>
            </section>

            <div className="h-px bg-gray-100 dark:bg-neutral-700" />

            {/* ── Section 5: Download results ── */}
            <section>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-primary dark:text-brand-detail">
                Download results
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {[
                  { key: "xv_summary", label: "Summary" },
                  { key: "xv_IMGTgappedNt", label: "IMGT-gapped nt sequences" },
                  { key: "xv_ntseq", label: "nt sequences" },
                  { key: "xv_IMGTgappedAA", label: "IMGT-gapped AA sequences" },
                  { key: "xv_AAseq", label: "AA sequences" },
                  { key: "xv_JUNCTION", label: "JUNCTION" },
                  { key: "xv_parameters", label: "Parameters" },
                  { key: "xv_V_REGIONmuttable", label: "V-REGION mutation table" },
                  { key: "xv_V_REGIONmutstatsNt", label: "V-REGION nt mutation stats" },
                  { key: "xv_V_REGIONmutstatsAA", label: "V-REGION AA mutation stats" },
                  { key: "xv_V_REGIONhotspots", label: "V-REGION hotspots" },
                  { key: "xv_scFv", label: "scFv" },
                ].map((item) => {
                  const isLocked = ["xv_summary", "xv_JUNCTION", "xv_parameters"].includes(item.key);
                  const isChecked = (options as any)[item.key];
                  return (
                    <label
                      key={item.key}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
                        isLocked
                          ? "cursor-default border-gray-100 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/50"
                          : isChecked
                          ? "border-brand-primary/30 bg-brand-primary/5 dark:border-brand-detail/30 dark:bg-brand-detail/5"
                          : "border-gray-200 bg-white hover:border-brand-primary/30 hover:bg-brand-primary/5 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-brand-detail/30"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isLocked}
                        onChange={(e) => setOptions({ ...options, [item.key]: e.target.checked })}
                      />
                      <span className={`text-xs font-medium leading-tight ${isLocked ? "text-gray-400 dark:text-neutral-500" : "text-gray-700 dark:text-gray-200"}`}>
                        {item.label}
                        {isLocked && <span className="ml-1 text-[10px] text-gray-400">(required)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

          </div>

          {/* ── Footer navigation ── */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800/30">
            <Button variant="outlined" onClick={() => setUiStep(1)}>
              ← Back to Selection
            </Button>
            <Button
              variant="contained"
              startIcon={<Send size={16} />}
              disabled={!selected.length || submit.isPending || !!analysisJobId}
              onClick={() => submit.mutate()}
            >
              Submit {selected.length} to IMGT/V-QUEST
            </Button>
          </div>

          {analysisJob.data && (
            <div className="border-t border-gray-100 px-6 pb-6 pt-4 dark:border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-brand-primary dark:bg-brand-detail animate-pulse" />
                  <span className="text-sm font-medium text-brand-primary dark:text-brand-detail">
                    {analysisJob.data.message || "Running IMGT/V-QUEST…"}
                  </span>
                </div>
                {typeof analysisJob.data.progress === "number" && (
                  <span className="text-sm font-bold tabular-nums text-brand-primary dark:text-brand-detail">
                    {Math.round(analysisJob.data.progress)}%
                  </span>
                )}
              </div>
              <LinearProgress value={typeof analysisJob.data.progress === "number" ? analysisJob.data.progress : undefined} />
              {analysisJob.data.error && (
                <Alert severity="error" className="mt-4">
                  {analysisJob.data.error}
                </Alert>
              )}
            </div>
          )}
        </Paper>
      )}
    </Container>
  );
}

