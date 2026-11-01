
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_users": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admission_notes": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"enrollment_id": string,"id": string,"note_type": Database["public"]['Enums']["note_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"enrollment_id": string,"id"?: string,"note_type"?: Database["public"]['Enums']["note_type"]
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"enrollment_id"?: string,"id"?: string,"note_type"?: Database["public"]['Enums']["note_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "admission_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admission_notes_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollment_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admission_notes_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_email": string | null,"actor_id": string | null,"created_at": string,"id": number,"new_data": Json | null,"old_data": Json | null,"record_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_email"?: string | null,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_email"?: string | null,"actor_id"?: string | null,"created_at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"batches": {
                  Row: {
                    "capacity": number | null,"course_id": string,"created_at": string,"end_date": string | null,"id": string,"is_active": boolean,"mode": Database["public"]['Enums']["batch_mode"],"name": string,"schedule": string | null,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"course_id": string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"is_active"?: boolean,"mode"?: Database["public"]['Enums']["batch_mode"],"name": string,"schedule"?: string | null,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number | null,"course_id"?: string,"created_at"?: string,"end_date"?: string | null,"id"?: string,"is_active"?: boolean,"mode"?: Database["public"]['Enums']["batch_mode"],"name"?: string,"schedule"?: string | null,"start_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batches_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"course_categories": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"courses": {
                  Row: {
                    "category_id": string | null,"code": string,"created_at": string,"created_by": string | null,"description": string,"duration_unit": Database["public"]['Enums']["duration_unit"],"duration_value": number,"eligibility": string | null,"highlights": (string)[],"id": string,"image_path": string | null,"is_featured": boolean,"level": Database["public"]['Enums']["course_level"],"max_capacity": number | null,"short_description": string,"sort_order": number,"status": Database["public"]['Enums']["course_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"duration_unit"?: Database["public"]['Enums']["duration_unit"],"duration_value": number,"eligibility"?: string | null,"highlights"?: (string)[],"id"?: string,"image_path"?: string | null,"is_featured"?: boolean,"level"?: Database["public"]['Enums']["course_level"],"max_capacity"?: number | null,"short_description": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["course_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"duration_unit"?: Database["public"]['Enums']["duration_unit"],"duration_value"?: number,"eligibility"?: string | null,"highlights"?: (string)[],"id"?: string,"image_path"?: string | null,"is_featured"?: boolean,"level"?: Database["public"]['Enums']["course_level"],"max_capacity"?: number | null,"short_description"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["course_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "course_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "courses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_installments": {
                  Row: {
                    "amount": number,"created_at": string,"due_date": string,"enrollment_id": string,"id": string,"installment_no": number,"label": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"due_date": string,"enrollment_id": string,"id"?: string,"installment_no": number,"label"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"due_date"?: string,"enrollment_id"?: string,"id"?: string,"installment_no"?: number,"label"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_installments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollment_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_installments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_payments": {
                  Row: {
                    "amount": number,"created_at": string,"enrollment_id": string,"id": string,"idempotency_key": string,"kind": Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"],"payment_date": string,"recorded_by": string | null,"remarks": string | null,"transaction_reference": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"enrollment_id": string,"id"?: string,"idempotency_key": string,"kind"?: Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"],"payment_date": string,"recorded_by"?: string | null,"remarks"?: string | null,"transaction_reference"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"enrollment_id"?: string,"id"?: string,"idempotency_key"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"method"?: Database["public"]['Enums']["payment_method"],"payment_date"?: string,"recorded_by"?: string | null,"remarks"?: string | null,"transaction_reference"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_payments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollment_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_payments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_structures": {
                  Row: {
                    "admission_fee": number,"course_id": string,"created_at": string,"created_by": string | null,"effective_from": string,"id": string,"installment_count": number,"installment_interval_months": number,"is_current": boolean,"notes": string | null,"registration_fee": number,"total_fee": number | null,"tuition_fee": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admission_fee"?: number,"course_id": string,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"id"?: string,"installment_count"?: number,"installment_interval_months"?: number,"is_current"?: boolean,"notes"?: string | null,"registration_fee"?: number,"total_fee"?: never,"tuition_fee": number,"updated_at"?: string
                  }
                  Update: {
                    "admission_fee"?: number,"course_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"id"?: string,"installment_count"?: number,"installment_interval_months"?: number,"is_current"?: boolean,"notes"?: string | null,"registration_fee"?: number,"total_fee"?: never,"tuition_fee"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_structures_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_structures_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    }
                  ]
                },"institute_settings": {
                  Row: {
                    "about": string | null,"address_line": string | null,"alt_phone": string | null,"authorised_signatory": string | null,"city": string | null,"country": string,"created_at": string,"currency": string,"email": string | null,"id": number,"institute_name": string,"logo_path": string | null,"office_hours": string | null,"phone": string | null,"postal_code": string | null,"privacy_policy": string | null,"receipt_footer": string | null,"state": string | null,"tagline": string | null,"tax_id": string | null,"timezone": string,"updated_at": string,"updated_by": string | null,"website": string | null,"whatsapp": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "about"?: string | null,"address_line"?: string | null,"alt_phone"?: string | null,"authorised_signatory"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: number,"institute_name"?: string,"logo_path"?: string | null,"office_hours"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"privacy_policy"?: string | null,"receipt_footer"?: string | null,"state"?: string | null,"tagline"?: string | null,"tax_id"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null,"whatsapp"?: string | null
                  }
                  Update: {
                    "about"?: string | null,"address_line"?: string | null,"alt_phone"?: string | null,"authorised_signatory"?: string | null,"city"?: string | null,"country"?: string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: number,"institute_name"?: string,"logo_path"?: string | null,"office_hours"?: string | null,"phone"?: string | null,"postal_code"?: string | null,"privacy_policy"?: string | null,"receipt_footer"?: string | null,"state"?: string | null,"tagline"?: string | null,"tax_id"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"channel": string,"created_at": string,"id": string,"last_error": string | null,"payload": NonNullable<Json>,"recipient": string,"sent_at": string | null,"status": string,"template": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient": string,"sent_at"?: string | null,"status"?: string,"template": string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: string,"created_at"?: string,"id"?: string,"last_error"?: string | null,"payload"?: NonNullable<Json>,"recipient"?: string,"sent_at"?: string | null,"status"?: string,"template"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_receipts": {
                  Row: {
                    "amount": number,"batch_name": string | null,"course_title": string,"enrollment_id": string,"id": string,"is_void": boolean,"issued_at": string,"issued_by": string | null,"issued_by_name": string | null,"kind": Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"],"payment_date": string,"payment_id": string,"previous_balance": number,"receipt_no": string,"registration_no": string,"remaining_balance": number,"student_code": string,"student_name": string,"total_fee": number,"transaction_reference": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"batch_name"?: string | null,"course_title": string,"enrollment_id": string,"id"?: string,"is_void"?: boolean,"issued_at"?: string,"issued_by"?: string | null,"issued_by_name"?: string | null,"kind": Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"],"payment_date": string,"payment_id": string,"previous_balance": number,"receipt_no": string,"registration_no": string,"remaining_balance": number,"student_code": string,"student_name": string,"total_fee": number,"transaction_reference"?: string | null
                  }
                  Update: {
                    "amount"?: number,"batch_name"?: string | null,"course_title"?: string,"enrollment_id"?: string,"id"?: string,"is_void"?: boolean,"issued_at"?: string,"issued_by"?: string | null,"issued_by_name"?: string | null,"kind"?: Database["public"]['Enums']["payment_kind"],"method"?: Database["public"]['Enums']["payment_method"],"payment_date"?: string,"payment_id"?: string,"previous_balance"?: number,"receipt_no"?: string,"registration_no"?: string,"remaining_balance"?: number,"student_code"?: string,"student_name"?: string,"total_fee"?: number,"transaction_reference"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_receipts_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollment_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_receipts_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_receipts_issued_by_fkey"
      columns: ["issued_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_receipts_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "fee_payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_receipts_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payment_ledger"
      referencedColumns: ["id"]
    }
                  ]
                },"student_enrollments": {
                  Row: {
                    "additional_charges": number,"admission_fee": number,"batch_id": string | null,"client_token": string | null,"course_id": string,"created_at": string,"created_by": string | null,"discount": number,"enrolled_at": string | null,"fee_remarks": string | null,"fee_structure_id": string | null,"id": string,"installment_count": number,"registration_fee": number,"registration_no": string,"scholarship": number,"source": string,"status": Database["public"]['Enums']["admission_status"],"status_changed_at": string,"student_id": string,"student_message": string | null,"total_fee": number | null,"tuition_fee": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "additional_charges"?: number,"admission_fee"?: number,"batch_id"?: string | null,"client_token"?: string | null,"course_id": string,"created_at"?: string,"created_by"?: string | null,"discount"?: number,"enrolled_at"?: string | null,"fee_remarks"?: string | null,"fee_structure_id"?: string | null,"id"?: string,"installment_count"?: number,"registration_fee"?: number,"registration_no": string,"scholarship"?: number,"source"?: string,"status"?: Database["public"]['Enums']["admission_status"],"status_changed_at"?: string,"student_id": string,"student_message"?: string | null,"total_fee"?: never,"tuition_fee"?: number,"updated_at"?: string
                  }
                  Update: {
                    "additional_charges"?: number,"admission_fee"?: number,"batch_id"?: string | null,"client_token"?: string | null,"course_id"?: string,"created_at"?: string,"created_by"?: string | null,"discount"?: number,"enrolled_at"?: string | null,"fee_remarks"?: string | null,"fee_structure_id"?: string | null,"id"?: string,"installment_count"?: number,"registration_fee"?: number,"registration_no"?: string,"scholarship"?: number,"source"?: string,"status"?: Database["public"]['Enums']["admission_status"],"status_changed_at"?: string,"student_id"?: string,"student_message"?: string | null,"total_fee"?: never,"tuition_fee"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_enrollments_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_fee_structure_id_fkey"
      columns: ["fee_structure_id"]
isOneToOne: false
      referencedRelation: "fee_structures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "payment_ledger"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"students": {
                  Row: {
                    "address_line": string | null,"alt_mobile": string | null,"city": string,"country": string,"created_at": string,"date_of_birth": string | null,"email": string,"full_name": string,"gender": Database["public"]['Enums']["gender"] | null,"highest_qualification": string,"id": string,"institution_name": string | null,"mobile": string,"postal_code": string,"privacy_consent_at": string,"state": string,"student_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line"?: string | null,"alt_mobile"?: string | null,"city": string,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"email": string,"full_name": string,"gender"?: Database["public"]['Enums']["gender"] | null,"highest_qualification": string,"id"?: string,"institution_name"?: string | null,"mobile": string,"postal_code": string,"privacy_consent_at": string,"state": string,"student_code": string,"updated_at"?: string
                  }
                  Update: {
                    "address_line"?: string | null,"alt_mobile"?: string | null,"city"?: string,"country"?: string,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string,"full_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"highest_qualification"?: string,"id"?: string,"institution_name"?: string | null,"mobile"?: string,"postal_code"?: string,"privacy_consent_at"?: string,"state"?: string,"student_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "admin_users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "enrollment_overview": {
                  Row: {
                    "amount_refunded": number | null,"balance": number | null,"batch_end_date": string | null,"batch_id": string | null,"batch_name": string | null,"batch_start_date": string | null,"city": string,"course_code": string,"course_id": string,"course_title": string,"created_at": string,"email": string,"enrolled_at": string | null,"full_name": string,"id": string,"mobile": string,"net_paid": number | null,"next_due_amount": number | null,"next_due_date": string | null,"next_installment_no": number | null,"overdue_amount": number | null,"payment_status": string | null,"registration_no": string,"source": string,"status": Database["public"]['Enums']["admission_status"],"status_changed_at": string,"student_code": string,"student_id": string,"student_message": string | null,"total_fee": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "student_enrollments_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "payment_ledger"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_ledger": {
                  Row: {
                    "amount": number,"course_code": string,"course_id": string,"course_title": string,"created_at": string,"enrollment_id": string,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"method": Database["public"]['Enums']["payment_method"],"payment_date": string,"receipt_id": string | null,"receipt_no": string | null,"recorded_by_name": string | null,"registration_no": string,"remarks": string | null,"student_code": string,"student_id": string,"student_name": string,"transaction_reference": string | null,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "fee_payments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollment_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_payments_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "dashboard_summary":
{ Args: { "p_from"?: string,"p_to"?: string }; Returns: Json
                           },
"delete_course":
{ Args: { "p_course_id": string }; Returns: undefined
                           },
"get_public_catalog":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_payment":
{ Args: { "p_amount": number,"p_enrollment_id": string,"p_idempotency_key": string,"p_method": Database["public"]['Enums']["payment_method"],"p_payment_date": string,"p_remarks"?: string,"p_transaction_reference"?: string }; Returns: Json
                           },
"record_refund":
{ Args: { "p_amount": number,"p_enrollment_id": string,"p_idempotency_key": string,"p_method": Database["public"]['Enums']["payment_method"],"p_payment_date": string,"p_remarks"?: string,"p_transaction_reference"?: string }; Returns: Json
                           },
"report_collections":
{ Args: { "p_from": string,"p_period"?: string,"p_to": string }; Returns: {
              "collected": number,"net": number,"payments_count": number,"period_label": string,"period_start": string,"refunded": number
            }[]
                           },
"report_course_revenue":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "billable_enrollments": number,"billed": number,"collected_in_period": number,"collected_total": number,"course_code": string,"course_id": string,"course_status": Database["public"]['Enums']["course_status"],"course_title": string,"outstanding": number,"registrations": number
            }[]
                           },
"report_outstanding":
{ Args: { "p_course_id"?: string,"p_overdue_only"?: boolean }; Returns: {
              "balance": number,"batch_name": string,"course_title": string,"days_overdue": number,"email": string,"enrollment_id": string,"mobile": string,"net_paid": number,"next_due_date": string,"oldest_overdue_date": string,"overdue_amount": number,"payment_status": string,"registration_no": string,"status": Database["public"]['Enums']["admission_status"],"student_code": string,"student_id": string,"student_name": string,"total_fee": number
            }[]
                           },
"report_payment_methods":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "collected": number,"method": Database["public"]['Enums']["payment_method"],"net": number,"payments_count": number,"refunded": number
            }[]
                           },
"save_installment_plan":
{ Args: { "p_enrollment_id": string,"p_installments": Json }; Returns: undefined
                           },
"set_course_fee":
{ Args: { "p_admission_fee"?: number,"p_course_id": string,"p_installment_count"?: number,"p_interval_months"?: number,"p_notes"?: string,"p_registration_fee"?: number,"p_tuition_fee": number }; Returns: string
                           },
"submit_registration":
{ Args: { "p_alt_mobile"?: string,"p_batch_id"?: string,"p_city": string,"p_client_token"?: string,"p_course_id": string,"p_date_of_birth"?: string,"p_email": string,"p_full_name": string,"p_gender"?: Database["public"]['Enums']["gender"],"p_highest_qualification": string,"p_institution_name"?: string,"p_message"?: string,"p_mobile": string,"p_postal_code": string,"p_privacy_consent": boolean,"p_state": string,"p_website"?: string }; Returns: Json
                           },
"update_enrollment_batch":
{ Args: { "p_batch_id"?: string,"p_enrollment_id": string }; Returns: undefined
                           },
"update_enrollment_fees":
{ Args: { "p_additional_charges": number,"p_admission_fee": number,"p_discount": number,"p_enrollment_id": string,"p_first_due_date": string,"p_installment_count": number,"p_interval_months"?: number,"p_registration_fee": number,"p_remarks"?: string,"p_scholarship": number,"p_tuition_fee": number }; Returns: undefined
                           },
"update_enrollment_status":
{ Args: { "p_enrollment_id": string,"p_note"?: string,"p_status": Database["public"]['Enums']["admission_status"] }; Returns: undefined
                           },
"void_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: undefined
                           }
          }
          Enums: {
            "admission_status": "new_enquiry"|"contacted"|"application_submitted"|"under_review"|"approved"|"enrolled"|"rejected"|"withdrawn","app_role": "super_admin"|"administrator"|"accounts_staff"|"admissions_staff","batch_mode": "classroom"|"online"|"hybrid","course_level": "beginner"|"intermediate"|"advanced"|"all_levels","course_status": "draft"|"published"|"inactive","duration_unit": "hours"|"days"|"weeks"|"months"|"years","gender": "male"|"female"|"other"|"prefer_not_to_say","note_type": "note"|"call"|"email"|"whatsapp"|"meeting"|"status_change"|"system","payment_kind": "payment"|"refund","payment_method": "upi"|"cash"|"bank_transfer"|"card"|"cheque"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "admission_status": ["new_enquiry", "contacted", "application_submitted", "under_review", "approved", "enrolled", "rejected", "withdrawn"],"app_role": ["super_admin", "administrator", "accounts_staff", "admissions_staff"],"batch_mode": ["classroom", "online", "hybrid"],"course_level": ["beginner", "intermediate", "advanced", "all_levels"],"course_status": ["draft", "published", "inactive"],"duration_unit": ["hours", "days", "weeks", "months", "years"],"gender": ["male", "female", "other", "prefer_not_to_say"],"note_type": ["note", "call", "email", "whatsapp", "meeting", "status_change", "system"],"payment_kind": ["payment", "refund"],"payment_method": ["upi", "cash", "bank_transfer", "card", "cheque", "other"]
          }
        }
} as const
