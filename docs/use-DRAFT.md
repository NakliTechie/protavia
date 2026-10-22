# What Protavia is for

> **Draft, 2026-10-22. Not published and not linked from anywhere.** Chirag has to agree with it,
> change it, or throw it out before it becomes the project's position. It was overdue: the app
> went public on 2026-10-20 and this was not written.

Protavia designs protein binders. A binder is a small protein made to stick to a chosen target
protein. That is how a lot of medicine works, and it is also, in principle, how some harm could be
done, so it is worth saying plainly what this tool does and does not change.

## What it actually adds

Two things, and it is worth separating them, because they are not equally consequential.

**In the browser:** it opens a structure and runs ProteinMPNN on it to rewrite a chain's sequence.
ProteinMPNN is published, its weights are public, and it has been runnable on a laptop for years.
Protavia makes it one click instead of an afternoon of Python. That is a convenience, not a new
capability.

**Through the compute bridge:** it starts a design loop on a machine the person using it installed
an engine on themselves. The engine — FreeBindCraft, BindCraft2, BioEmu2 — is someone else's
published software that they downloaded and installed. Protavia writes its settings file and reads
its results. Anyone who can install the engine can run it without Protavia, and the licence
Protavia relies on requires exactly that.

So the honest summary is that Protavia lowers the effort of work that was already available to
anyone willing to spend a day on it. It does not put a new capability in anyone's hands.

## What actually stands between a design and harm

Not the software. A sequence from any of these tools is a guess, and most guesses fail. Between a
designed sequence and a molecule that does anything at all sit gene synthesis, expression,
purification, binding assays and a great deal of failure — which is why FreeBindCraft's own small
example finishes with zero accepted designs. Every published benchmark in this field reports
success rates, not successes.

That work needs a laboratory, reagents, equipment and months. Those are the real constraints, and
none of them is affected by anything in this repository. Gene synthesis providers screen orders
against sequences of concern; that screening is a far more load-bearing control than anything a
design tool can do.

## Where the line is

I will not help choose a target because it would cause harm, or help design against one. That is a
judgment about intent, not about sequences, and it is the one place this project draws a line.

Everything else here is ordinary structural biology: look at a protein, see what a model would put
on its backbone, compare models, rank the results.

## What the project does structurally

These are not promises of good behaviour; they are properties of how it is built.

- **The compute never runs on our hardware for anyone else.** A run happens on the machine of the
  person who started it, on an engine they installed. This is also what the BindCraft2 licence
  requires, and it is why the bridge serves the app rather than the hosted site calling out.
- **Nothing leaves the machine.** Structures are read in the browser. The only network call the
  hosted app makes is fetching a structure you asked for from the Protein Data Bank.
- **No account, no telemetry, no log of what anyone designed.** There is nothing to subpoena and
  nothing to leak, because nothing is collected.
- **Targets come from the public archive.** The Protein Data Bank is open to anyone with a browser.

## What would change this

If Protavia ever ran an engine for other people, it would become a service that performs design on
request, and this note would need rewriting — along with a re-tier from Tool to Product and a
commercial licence from the BindCraft2 authors. That is a decision to take in writing, not to
arrive at.

## Open

Whether this belongs in the README, in the app, or only here. My view is a link in the README and
nothing in the interface: a notice nobody reads is worse than none, and the page already says
where every run happens.
