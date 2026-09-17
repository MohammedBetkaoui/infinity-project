// ApplicationField props bound to one field of the registration state.
// ApplicationField builds its id as `${formId}-${name}`, which matches the
// ids the hook focuses (fieldId / studentFieldId).
export const sectionFieldProps = (registration, section, field) => ({
  formId: `axr-${section}`,
  name: field,
  value: registration[section][field],
  error: registration.fieldError(section, field),
  onChange: (_, value) => registration.setField(section, field, value),
  onBlur: () => registration.touch(`${section}.${field}`),
})

export const studentFieldProps = (registration, student, field) => ({
  formId: `axr-${student.id}`,
  name: field,
  value: student[field],
  error: registration.studentError(student.id, field),
  onChange: (_, value) => registration.setStudent(student.id, field, value),
  onBlur: () => registration.touch(`student.${student.id}.${field}`),
})
