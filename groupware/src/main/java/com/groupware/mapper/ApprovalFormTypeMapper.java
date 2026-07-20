package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.groupware.dto.ApprovalFormTypeDTO;

@Mapper
public interface ApprovalFormTypeMapper {

	// 기안 작성 화면의 서식 3종(연차휴가신청서/지출결의서/프로젝트품의서) 카드용
	List<ApprovalFormTypeDTO> findAll();

	// 기안 등록 시 이 서식의 결재 단계 수(1 또는 2)를 확인해 APPROVAL_LINE을 몇 개 만들지 결정
	ApprovalFormTypeDTO findById(@Param("formTypeId") int formTypeId);
}
