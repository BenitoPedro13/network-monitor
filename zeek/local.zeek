# Site config for the passive flow sensor (Task 19).
# JSON logs, no rotation (ingest tails by byte offset), conn + ssl streams only.

redef LogAscii::use_json = T;
redef Log::default_rotation_interval = 0 secs;

# macOS NIC checksum offloading makes captured outgoing packets look corrupt
redef ignore_checksums = T;

event zeek_init() &priority=-10
	{
	local to_disable: set[Log::ID];
	for ( id in Log::active_streams )
		{
		if ( id != Conn::LOG && id != SSL::LOG )
			add to_disable[id];
		}
	for ( id in to_disable )
		Log::disable_stream(id);
	}
