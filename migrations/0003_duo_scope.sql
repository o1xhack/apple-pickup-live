-- The public product scope is iPhone Duo only. Private App history is untouched.
DELETE FROM legacy_hourly WHERE source='legacy_ca' AND part NOT IN ('MK1E4LL/A','MK1F4LL/A','MK1G4LL/A','MK1H4LL/A','MK1J4LL/A','MK1L4LL/A','MK1Q4LL/A','MK1R4LL/A');
DELETE FROM stock_events WHERE source='legacy_ca' AND part NOT IN ('MK1E4LL/A','MK1F4LL/A','MK1G4LL/A','MK1H4LL/A','MK1J4LL/A','MK1L4LL/A','MK1Q4LL/A','MK1R4LL/A');
UPDATE metadata AS m SET value=json_set(m.value,
 '$.products',json((SELECT json_group_array(json(j.value)) FROM json_each(m.value,'$.products') j WHERE json_extract(j.value,'$.model')='iPhone Duo')),
 '$.checks',(SELECT coalesce(sum(checks),0) FROM legacy_hourly WHERE source='legacy_ca'),
 '$.hits',(SELECT coalesce(sum(hits),0) FROM legacy_hourly WHERE source='legacy_ca'),
 '$.unknown',(SELECT coalesce(sum(unknown),0) FROM legacy_hourly WHERE source='legacy_ca'),
 '$.pending',(SELECT coalesce(sum(pending),0) FROM legacy_hourly WHERE source='legacy_ca'),
 '$.hourlyRows',(SELECT count(*) FROM legacy_hourly WHERE source='legacy_ca'),
 '$.events',(SELECT count(*) FROM stock_events WHERE source='legacy_ca')) WHERE key='legacy_ca';
