enum MESSAGE_TYPE {
    REQUEST,
    RESPONSE,
    EVENT,
    ACK,
    ERROR,
}

enum MESSAGE_STATUS {
    OK,
    BAD_REQUEST,
    NOT_FOUND,
    TIMEOUT,
    CONFLICT,
    INTERNAL_ERROR,
    NOT_READY,
    REJECTED,
}

enum MESSAGE_ACK {
    ACCEPTED,
    QUEUED,
    DONE,
    FAILED,
}

function Message() constructor {
    self.id = uuid();
    self.type = 0;
    self.source = "";
    self.destination = "";
    self.correlation_id = uuid();
    self.status_code = 0;
    self.version = 0;
    self.payload = {};
    self.timestamp = date_current_datetime();
}
