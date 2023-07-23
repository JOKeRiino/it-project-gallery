export class ChatError extends Error {
	constructor(message, sender) {
		super(message);
		this.timestamp = new Date();
		this.sender = sender;
	}
}
