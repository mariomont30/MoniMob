import React, { useState } from 'react';
import { Alert, View, Text, Platform, Keyboard } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from './ui.js';
import { displayDate } from '../services/presentation.js';
import { projectDateTime, validateFuture } from '../services/formValidation.js';
import { styles } from '../theme/styles.js';

export function DateTimeField({ label, value, onChange, mode = 'date', date, futureOnly = true, maximumDate }) {
  const [open, setOpen] = useState(false);
  const today = projectDateTime();
  const fallback = projectDateTime(new Date(Date.now() + 120000));
  const selected = new Date(
    `${mode === 'date' ? value || fallback.date : date || fallback.date}T${mode === 'time' ? value || fallback.time : '12:00'}:00-03:00`,
  );
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <Button
        variant="outline"
        label={
          value
            ? mode === 'date'
              ? displayDate(value)
              : value
            : mode === 'date'
              ? 'Selecionar data'
              : 'Selecionar horário'
        }
        onPress={() => {
          if (futureOnly && mode === 'time' && !date) {
            Alert.alert(label, 'Selecione a data primeiro.');
            return;
          }
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      {!futureOnly && value ? (
        <Button
          label={'Limpar ' + label}
          variant="ghost"
          onPress={() => {
            setOpen(false);
            onChange('');
          }}
        />
      ) : null}
      {open ? (
        <DateTimePicker
          value={Number.isFinite(selected.getTime()) ? selected : new Date()}
          mode={mode}
          display={Platform.OS === 'android' ? (mode === 'date' ? 'calendar' : 'clock') : 'default'}
          is24Hour
          locale="pt-BR"
          timeZoneName="America/Sao_Paulo"
          minimumDate={
            futureOnly && mode === 'date' ? new Date(`${today.date}T00:00:00-03:00`) : undefined
          }
          maximumDate={mode === 'date' && maximumDate ? new Date(`${maximumDate}T23:59:59-03:00`) : undefined}
          onChange={(event, chosen) => {
            setOpen(false);
            if (event.type === 'dismissed' || !chosen) return;
            const result = projectDateTime(chosen);
            try {
              if (futureOnly && mode === 'date' && result.date < today.date)
                throw new Error('Selecione hoje ou uma data futura.');
              if (mode === 'date' && maximumDate && result.date > maximumDate)
                throw new Error('A data deve estar dentro do período autorizado pelo professor.');
              if (futureOnly && mode === 'time') validateFuture(date || today.date, result.time);
              onChange(mode === 'date' ? result.date : result.time);
            } catch (error) {
              Alert.alert(label, error.message);
            }
          }}
        />
      ) : null}
    </View>
  );
}
