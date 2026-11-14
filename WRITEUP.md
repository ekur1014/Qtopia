Notebook 1: BB84 Eavesdropper

Part 1 — No eavesdropper
Qubits sent (200 bits):
QBER = [[ 0.00 % ]]

Part 2 — With vs. without the eavesdropper
No Eve:	QBER = 0 % 
Intercept-resend Eve: ~25 % 

Part 3 — Hardware run (no Eve)
IonQ Simulator 
    Job ID: [[ionq:ionq:sim:simulator-a7b0-qjob-6af7c328f15852ed27b72012]] 
    Shots: 200
    QBER: 0.08%
IonQ Forte 1
    Job ID:	[[ ]]	[[ ]]
	[[ job QRN ]]	[[ ]]	[[ ]]

On real hardware the QBER isn't zero even without Eve, because gate errors, state-prep/measurement errors, and decoherence flip some bits. Alice and Bob can't differentiate between hardware noise and eavesdropping effects, so they must treat every error as an attack.

For BB84 with one-way error correction and privacy amplification, a secure key can still be extracted as long as QBER < ~11% (the Shor–Preskill bound). A full intercept-resend attack produces ~25%, far above that bound.

My hardware QBER of [[ X % ]] is [[ below / above ]] 11%, so [[ a secure key could still be distilled / the run would be aborted ]].
I would set my abort threshold at [[ e.g. 11 % ]], because [[ your reasoning: e.g. it sits safely above the hardware noise floor measured here and well below the 25% signature of a full attack ]].

Part 4

The Z basis {|0⟩, |1⟩} and X basis {|+⟩, |−⟩} are orthogonal, so measuring a state from one basis in the other gives a 50/50 random result, and the original information is destroyed.
Measurement disturbs the state. Eve doesn't know Alice's basis. Whenever she measures in the wrong one, the qubit collapses into her basis, and the state she re-sends is no longer the one Alice prepared. She can't undo this.

Due to the confines of the No-cloning Theorem, Eve can't copy the unknown qubit, keep the copy, and forward the original untouched. No unitary operation clones an arbitrary unknown state. Any attempt to gain information necessarily disturbs what Bob receives (information–disturbance trade-off).



Security therefore rests on the laws of quantum mechanics rather than on an assumption that a math problem (like factoring) is hard to solve.