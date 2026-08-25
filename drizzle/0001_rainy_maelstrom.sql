CREATE TABLE `appointmentSlots` (
	`id` varchar(64) NOT NULL,
	`clinician` varchar(160) NOT NULL,
	`specialty` varchar(120) NOT NULL,
	`dayLabel` varchar(80) NOT NULL,
	`timeLabel` varchar(80) NOT NULL,
	`location` varchar(220) NOT NULL,
	`status` enum('available','booked') NOT NULL DEFAULT 'available',
	CONSTRAINT `appointmentSlots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patientAllergies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	CONSTRAINT `patientAllergies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patientAppointments` (
	`id` varchar(64) NOT NULL,
	`patientId` varchar(64) NOT NULL,
	`slotId` varchar(64) NOT NULL,
	`clinician` varchar(160) NOT NULL,
	`specialty` varchar(120) NOT NULL,
	`dateLabel` varchar(80) NOT NULL,
	`timeLabel` varchar(80) NOT NULL,
	`location` varchar(220) NOT NULL,
	`status` enum('scheduled','cancelled') NOT NULL DEFAULT 'scheduled',
	`confirmationCode` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patientAppointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patientMedications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`dosage` varchar(160) NOT NULL,
	CONSTRAINT `patientMedications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` varchar(64) NOT NULL,
	`memberId` varchar(64) NOT NULL,
	`phoneHash` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`initials` varchar(8) NOT NULL,
	`dateOfBirth` varchar(32) NOT NULL,
	`plan` varchar(160) NOT NULL,
	`planStatus` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
	`specialistCopay` varchar(32) NOT NULL,
	`deductibleRemaining` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_memberId_unique` UNIQUE(`memberId`)
);
